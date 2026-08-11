import {createContext,useCallback,useContext,useEffect,useMemo,useState} from 'react';
import {api} from '../lib/api.js';

const AuthContext=createContext(null);
const stores=[localStorage,sessionStorage];
const clearSession=()=>stores.forEach(store=>{store.removeItem('orbit_token');store.removeItem('orbit_user')});
const activeStore=()=>localStorage.getItem('orbit_token')?localStorage:sessionStorage;

export function AuthProvider({children}){
  const [user,setUser]=useState(null);
  const [hydrating,setHydrating]=useState(true);
  const logout=useCallback(()=>{clearSession();setUser(null)},[]);

  useEffect(()=>{
    const expired=()=>logout();
    window.addEventListener('orbit:session-expired',expired);
    const token=localStorage.getItem('orbit_token')||sessionStorage.getItem('orbit_token');
    if(!token){setHydrating(false);return()=>window.removeEventListener('orbit:session-expired',expired)}
    api('/auth/me').then(result=>{
      activeStore().setItem('orbit_user',JSON.stringify(result.user));
      setUser(result.user);
    }).catch(logout).finally(()=>setHydrating(false));
    return()=>window.removeEventListener('orbit:session-expired',expired);
  },[logout]);

  const login=async(credentials,{remember=true}={})=>{
    const result=await api('/auth/login',{method:'POST',body:credentials});
    clearSession();
    const store=remember?localStorage:sessionStorage;
    store.setItem('orbit_token',result.token);
    store.setItem('orbit_user',JSON.stringify(result.user));
    setUser(result.user);
    return result.user;
  };
  const value=useMemo(()=>({user,hydrating,login,logout,can:(...roles)=>roles.includes(user?.role)}),[user,hydrating,logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
export const useAuth=()=>useContext(AuthContext);
