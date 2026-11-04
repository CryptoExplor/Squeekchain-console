// Dev-only watch shortcut. API account is a candidate for viewing, never authority.
import {createDisplayApi,getProfile} from './bundle.js';
const button=document.createElement('button');button.className='btn';button.textContent='Try a holder';button.dataset.testid='try-holder';
button.onclick=async()=>{button.disabled=true;try{const api=createDisplayApi({profile:getProfile('sepolia-v9')}),result=await api.feed('/events?category=players&limit=100');const event=result.data.events.find(e=>e.type==='nft.deposited'&&/^0x[\da-f]{40}$/i.test(e.payload?.account??''));if(!event)throw new Error('No deposited-holder candidate in this page');document.getElementById('watch-input').value=event.payload.account;document.getElementById('btn-watch').click();}catch(error){button.title=error.message;}finally{button.disabled=false;}};
document.getElementById('watch-row').append(button);
