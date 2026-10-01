import {useEffect,useRef,useState} from 'react';
import {supabase} from './supabase';
import {readPending,savePending} from './pending';

type GoogleIdentity={initialize:(options:Record<string,unknown>)=>void;renderButton:(element:HTMLElement,options:Record<string,unknown>)=>void};
declare global {interface Window {google?:{accounts:{id:GoogleIdentity}}}}
let loading:Promise<void>|undefined;
function loadGoogle(){
  if(window.google)return Promise.resolve();
  return loading??=new Promise<void>((resolve,reject)=>{
    const script=document.createElement('script');script.src='https://accounts.google.com/gsi/client';script.async=true;
    const timer=setTimeout(()=>{script.remove();loading=undefined;reject(new Error('Google sign-in took too long to load. Please reopen sign-in.'));},15000);
    script.onload=()=>{clearTimeout(timer);resolve();};
    script.onerror=()=>{clearTimeout(timer);script.remove();loading=undefined;reject(new Error('Could not load Google sign-in. Please reopen sign-in.'));};
    document.head.appendChild(script);
  });
}
export const googleSignInConfigured=Boolean(import.meta.env.VITE_GOOGLE_CLIENT_ID);
export function GoogleSignIn(){
  const host=useRef<HTMLDivElement>(null);
  const [message,setMessage]=useState('Loading Google sign-in…');
  useEffect(()=>{
    let cancelled=false,exchanging=false;
    async function setup(){
      try{
        await loadGoogle();
        const nonce=Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');
        const hashed=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(nonce))),b=>b.toString(16).padStart(2,'0')).join('');
        if(cancelled||!host.current||!window.google)return;
        window.google.accounts.id.initialize({client_id:import.meta.env.VITE_GOOGLE_CLIENT_ID,nonce:hashed,ux_mode:'popup',auto_select:false,use_fedcm_for_prompt:true,
          callback:async({credential}:{credential:string})=>{
            if(cancelled||exchanging||!supabase)return;
            exchanging=true;setMessage('Signing you in…');
            // Switching from an email attempt to Google must not strand the saved request.
            const pending=readPending();if(pending)savePending({...pending,email:undefined});
            try{
              const {error}=await supabase.auth.signInWithIdToken({provider:'google',token:credential,nonce});
              if(error)throw error;
              // Supabase persists this session in the originating PWA, then App resumes its draft.
            }catch{if(!cancelled)setMessage('Google sign-in could not finish. Please try again. Your request is saved.');}
            finally{exchanging=false;}
          }});
        window.google.accounts.id.renderButton(host.current,{type:'standard',theme:'outline',size:'large',text:'continue_with',shape:'pill',width:Math.min(360,host.current.clientWidth)});
        setMessage('Choose your Google account to continue.');
      }catch(e){if(!cancelled)setMessage(e instanceof Error?e.message:'Google sign-in is unavailable.');}
    }
    void setup();return()=>{cancelled=true;};
  },[]);
  return <div className="google-signin"><div ref={host}/><p className="auth-message" role="status">{message}</p></div>;
}
