import {createContext,useContext,useEffect,useMemo,useState} from 'react';
import {api} from '../lib/api.js';
const AuthContext=createContext(null);
export function AuthProvider({children}){
  const [user,setUser]=useState(()=>{try{return JSON.parse(localStorage.getItem('orbit_user'))}catch{return null}});
  useEffect(()=>{const expired=()=>setUser(null);window.addEventListener('orbit:session-expired',expired);return()=>window.removeEventListener('orbit:session-expired',expired)},[]);
  useEffect(()=>{if(localStorage.getItem('orbit_token'))api('/auth/me').then(result=>{localStorage.setItem('orbit_user',JSON.stringify(result.user));setUser(result.user)}).catch(()=>setUser(null))},[]);
  const login=async(credentials)=>{const result=await api('/auth/login',{method:'POST',body:credentials});localStorage.setItem('orbit_token',result.token);localStorage.setItem('orbit_user',JSON.stringify(result.user));setUser(result.user);return result.user;};
  const logout=()=>{localStorage.removeItem('orbit_token');localStorage.removeItem('orbit_user');setUser(null)};
  const value=useMemo(()=>({user,login,logout,can:(...roles)=>roles.includes(user?.role)}),[user]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
export const useAuth=()=>useContext(AuthContext);
