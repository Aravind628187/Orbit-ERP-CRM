import React from 'react';
import {createRoot} from 'react-dom/client';
import {BrowserRouter,Navigate,Route,Routes} from 'react-router-dom';
import {AuthProvider,useAuth} from './context/AuthContext.jsx';
import {ToastProvider} from './context/ToastContext.jsx';
import Layout from './components/Layout.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Customers from './pages/Customers.jsx';
import CustomerDetail from './pages/CustomerDetail.jsx';
import Products from './pages/Products.jsx';
import ProductDetail from './pages/ProductDetail.jsx';
import Challans from './pages/Challans.jsx';
import ChallanBuilder from './pages/ChallanBuilder.jsx';
import ChallanDetail from './pages/ChallanDetail.jsx';
import Analytics from './pages/Analytics.jsx';
import AuditLogs from './pages/AuditLogs.jsx';
import Followups from './pages/Followups.jsx';
import StockMovements from './pages/StockMovements.jsx';
import {Forbidden,NotFound} from './pages/Errors.jsx';
import './styles.css';
import './design-system.css';

function Boot(){return <div className="app-boot" role="status" aria-live="polite">Loading Orbit…</div>}
function Private({children,roles}){
  const {user,hydrating}=useAuth();
  if(hydrating)return <Boot/>;
  if(!user)return <Navigate to="/login" replace/>;
  return <Layout>{roles&&!roles.includes(user.role)?<Forbidden/>:children}</Layout>;
}
const secured=(element,roles)=><Private roles={roles}>{element}</Private>;
function App(){
  const {user,hydrating}=useAuth();
  return <Routes>
    <Route path="/login" element={hydrating?<Boot/>:user?<Navigate to="/" replace/>:<Login/>}/>
    <Route path="/" element={secured(<Dashboard/>)}/>
    <Route path="/customers" element={secured(<Customers/>,['Admin','Sales'])}/>
    <Route path="/customers/:id" element={secured(<CustomerDetail/>,['Admin','Sales'])}/>
    <Route path="/follow-ups" element={secured(<Followups/>,['Admin','Sales'])}/>
    <Route path="/products" element={secured(<Products/>,['Admin','Sales','Warehouse'])}/>
    <Route path="/products/:id" element={secured(<ProductDetail/>,['Admin','Sales','Warehouse'])}/>
    <Route path="/stock-movements" element={secured(<StockMovements/>,['Admin','Warehouse'])}/>
    <Route path="/challans" element={secured(<Challans/>)}/>
    <Route path="/challans/new" element={secured(<ChallanBuilder/>,['Admin','Sales'])}/>
    <Route path="/challans/:id" element={secured(<ChallanDetail/>)}/>
    <Route path="/analytics" element={secured(<Analytics/>,['Admin','Accounts'])}/>
    <Route path="/audit-logs" element={secured(<AuditLogs/>,['Admin'])}/>
    <Route path="*" element={user?<Private><NotFound/></Private>:<Navigate to="/login" replace/>}/>
  </Routes>;
}
createRoot(document.getElementById('root')).render(<React.StrictMode><BrowserRouter><AuthProvider><ToastProvider><App/></ToastProvider></AuthProvider></BrowserRouter></React.StrictMode>);
