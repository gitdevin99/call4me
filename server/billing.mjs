import {randomUUID} from 'node:crypto';
import {Webhook} from 'standardwebhooks';
import {db,transaction,walletLock,dbConfigured} from './db.mjs';
const company=()=>process.env.WHOP_COMPANY_ID||'biz_5ta3KBWbyc9RMX';
export const paymentsReady=()=> Boolean(dbConfigured()&&process.env.WHOP_API_KEY&&process.env.WHOP_WEBHOOK_SECRET&&process.env.PAYMENTS_ENABLED==='true');
export async function whop(path,body) {
 const r=await fetch('https://api.whop.com/api/v1/'+path,{method:body?'POST':'GET',headers:{Authorization:`Bearer ${process.env.WHOP_API_KEY}`,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(20000)});
 if(!r.ok)throw new Error(`Payment service unavailable (${r.status}).`);return r.json();
}
export function paymentCredit(payment,order) {
 if(payment.company?.id!==company()||payment.checkout_configuration_id!==order.checkout_id||payment.metadata?.order_id!==order.id||payment.currency!=='usd') throw new Error('Payment does not match the order.');
 if(Math.round(Number(payment.subtotal)*100)!==order.cents)throw new Error('Payment amount mismatch.');
 if(payment.status!=='paid')return 0;
 if(payment.disputes?.some(d=>!['won','warning_closed'].includes(d.status)))return 0;
 const refunded=Math.round(Number(payment.refunded_amount||0)*100);
 return Math.max(0,order.cents-refunded);
}
export async function reconcilePayment(id,retrieve=whop) {
 const p=await retrieve('payments/'+encodeURIComponent(id));
 if(!p.metadata?.order_id)return;
 await transaction(async c=>{
  const order=(await c.query('select * from callapp.orders where id=$1 for update',[p.metadata.order_id])).rows[0];
  if(!order)return;
  if(order.payment_id&&order.payment_id!==id)throw new Error('Order already paid with another payment.');
  const credit=paymentCredit(p,order), delta=credit-order.credited;
  if(!delta)return;
  await walletLock(c,order.user_id);
  await c.query('update callapp.wallets set balance=balance+$2 where user_id=$1',[order.user_id,delta]);
  await c.query('update callapp.orders set credited=$2,payment_id=$3 where id=$1',[order.id,credit,id]);
  await c.query('insert into callapp.ledger(user_id,reference,title,cents,type) values($1,$2,$3,$4,$5)',[order.user_id,randomUUID(),delta>0?'Credit reload':'Reload refunded',delta,delta>0?'credit':'refund']);
 });
}
export async function checkout(user,cents) {
 if(!paymentsReady())throw new Error('Checkout is not available yet. No payment has been taken.');
 if(![500,1000,2000].includes(cents))throw new Error('Choose a listed credit amount.');
 const id=randomUUID();await db().query('insert into callapp.orders(id,user_id,cents) values($1,$2,$3)',[id,user,cents]);
 const result=await whop('checkout_configurations',{mode:'payment',plan:{company_id:company(),currency:'usd',plan_type:'one_time',visibility:'hidden',adaptive_pricing_enabled:false,initial_price:cents/100,renewal_price:0,title:`$${cents/100} calling credit`,product:{title:'Can You Call credit',external_identifier:'canyoucall-prepaid',collect_shipping_address:false}},metadata:{order_id:id},redirect_url:`${process.env.PUBLIC_ORIGIN}/?checkout=complete`});
 await db().query('update callapp.orders set checkout_id=$2 where id=$1',[id,result.id]);
 if(!result.purchase_url?.startsWith('https://'))throw new Error('Checkout URL unavailable.');
 return {url:result.purchase_url};
}
export async function whopWebhook(req,res) {
 try {
  if(!process.env.WHOP_WEBHOOK_SECRET)return res.sendStatus(503);
  const event=new Webhook(process.env.WHOP_WEBHOOK_SECRET,{format:"raw"}).verify(req.body.toString(),req.headers);
  let id;
  if(['payment.succeeded','payment.failed'].includes(event.type))id=event.data?.id;
  if(event.type?.startsWith('refund.')||event.type?.startsWith('dispute.'))id=event.data?.payment?.id||event.data?.payment_id;
  if(id){
   // Queue signed events even when refunds arrive before the successful payment.
   // The worker retrieves the payment and verifies its order before changing credit.
   await db().query('insert into callapp.payment_jobs(event_id,payment_id) values($1,$2) on conflict do nothing',[req.headers['webhook-id'],id]);
  }
  res.sendStatus(200);
 }catch(e){console.error('Payment webhook rejected:',e.message);res.sendStatus(400);}
}

export function startPaymentReconciliation(){
 let running=false;
 const timer=setInterval(async()=>{
  if(running||!dbConfigured())return;running=true;
  try{
   const rows=(await db().query("select event_id,payment_id from callapp.payment_jobs where completed_at is null and next_attempt <= now() order by created_at limit 10")).rows;
   for(const job of rows){try{await reconcilePayment(job.payment_id);await db().query('update callapp.payment_jobs set completed_at=now() where event_id=$1',[job.event_id]);}catch{await db().query("update callapp.payment_jobs set attempts=attempts+1,next_attempt=now()+interval '1 minute' * least(60,power(2,least(attempts,6))) where event_id=$1",[job.event_id]);console.error('Payment reconciliation pending',job.event_id);}}
  }catch{console.error('Payment reconciliation database unavailable');}finally{running=false;}
 },5000);timer.unref();return timer;
}
