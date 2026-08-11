import {createContext,useContext,useState} from 'react';import {CheckCircle2,X,AlertCircle} from 'lucide-react';
const ToastContext=createContext(null);let id=0;
export function ToastProvider({children}){const [toasts,setToasts]=useState([]);const toast=(message,type='success')=>{const key=++id;setToasts(v=>[...v,{key,message,type}]);setTimeout(()=>setToasts(v=>v.filter(x=>x.key!==key)),3500)};return <ToastContext.Provider value={toast}>{children}<div className="toast-stack">{toasts.map(t=><div className={`toast ${t.type}`} key={t.key}>{t.type==='success'?<CheckCircle2/>:<AlertCircle/>}<span>{t.message}</span><button onClick={()=>setToasts(v=>v.filter(x=>x.key!==t.key))}><X/></button></div>)}</div></ToastContext.Provider>}
export const useToast=()=>useContext(ToastContext);
