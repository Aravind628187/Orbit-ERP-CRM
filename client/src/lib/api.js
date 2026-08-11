const API_URL=import.meta.env.VITE_API_URL||'http://localhost:4000/api';

export class ApiError extends Error{constructor(message,status,errors){super(message);this.status=status;this.errors=errors;}}
export const api=async(path,options={})=>{
  const token=localStorage.getItem('orbit_token');
  const response=await fetch(`${API_URL}${path}`,{...options,headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{ }),...options.headers},body:options.body&&typeof options.body!=='string'?JSON.stringify(options.body):options.body});
  const data=await response.json().catch(()=>({}));
  if(!response.ok){if(response.status===401){localStorage.removeItem('orbit_token');localStorage.removeItem('orbit_user');window.dispatchEvent(new Event('orbit:session-expired'));}throw new ApiError(data.error?.message||data.message||'Request failed.',response.status,data.error?.details||data.errors);}
  return data.success===true?data.data:data;
};
export const queryString=(values)=>{const p=new URLSearchParams();Object.entries(values).forEach(([k,v])=>{if(v!==''&&v!=null)p.set(k,v)});return `?${p}`;};
