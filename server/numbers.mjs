import twilio from 'twilio';
import { parsePhoneNumberFromString } from 'libphonenumber-js';
export const phoneCountry = number => parsePhoneNumberFromString(number)?.country || null;
export const twilioClient = () => twilio(process.env.TWILIO_ACCOUNT_SID,process.env.TWILIO_AUTH_TOKEN,{autoRetry:false,timeout:15000});
let inventory={until:0,numbers:[]};
export async function ownedNumbers() {
 if(Date.now()<inventory.until) return inventory.numbers;
 const rows=await twilioClient().incomingPhoneNumbers.list({limit:1000});
 const numbers=rows.filter(n=>n.capabilities?.voice).map(n=>({id:n.sid,phone:n.phoneNumber,country:phoneCountry(n.phoneNumber),label:n.friendlyName}));
 inventory={until:Date.now()+60000,numbers};return numbers;
}
export function selectCaller(numbers,destination,requested) {
 if(requested){const match=numbers.find(n=>n.phone===requested);if(!match)throw new Error('That caller number is no longer available.');return match;}
 const country=phoneCountry(destination);
 const match=numbers.find(n=>country&&n.country===country)||numbers[0];
 if(!match)throw new Error('No voice-capable caller numbers are available in this account.');return match;
}
export async function numberCatalog(country) {
 if(!/^[A-Z]{2}$/.test(country))throw new Error('Choose a two-letter country code.');
 const client=twilioClient();
 const available=await client.availablePhoneNumbers(country).fetch();
 const types=Object.keys(available.subresourceUris||{});
 const numbers=types.includes('local')?await client.availablePhoneNumbers(country).local.list({voiceEnabled:true,limit:10}):[];
 return {country,types,owned:(await ownedNumbers()).filter(n=>n.country===country),available:numbers.map(n=>({phone:n.phoneNumber,country,locality:n.locality,addressRequirements:n.addressRequirements})),requiresPurchase:true};
}

export async function availableCountries(){return (await twilioClient().availablePhoneNumbers.list({limit:200})).map(c=>({country:c.countryCode,name:c.country}));}
