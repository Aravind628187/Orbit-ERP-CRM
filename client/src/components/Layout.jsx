import{useEffect,useMemo,useRef,useState}from'react';
import{NavLink,useLocation,useNavigate}from'react-router-dom';
import{BarChart3,Bell,Boxes,CalendarClock,ChevronRight,ClipboardList,Command,History,LayoutDashboard,LogOut,Menu,Moon,PanelLeftClose,PanelLeftOpen,Plus,ReceiptText,Search,Sun,UsersRound,X}from'lucide-react';
import{useAuth}from'../context/AuthContext.jsx';
import{initials}from'../lib/format.js';
import{api}from'../lib/api.js';
import{DropdownMenu,MenuItem,Tooltip}from'./UI.jsx';

const sections=[['Overview',[['/','Dashboard',LayoutDashboard]]],['CRM',[['/customers','Customers',UsersRound,['Admin','Sales']],['/follow-ups','Follow-ups',CalendarClock,['Admin','Sales']]]],['Sales',[['/challans','Challans',ReceiptText]]],['Inventory',[['/products','Products',Boxes,['Admin','Sales','Warehouse']],['/stock-movements','Stock movements',History,['Admin','Warehouse']]]],['Intelligence',[['/analytics','Analytics',BarChart3,['Admin','Accounts']]]],['System',[['/audit-logs','Audit logs',ClipboardList,['Admin']]]]];
const titles={'/':'Dashboard','/customers':'Customers','/follow-ups':'Follow-ups','/challans':'Challans','/challans/new':'New Sales Challan','/products':'Products','/stock-movements':'Stock Movements','/analytics':'Analytics','/audit-logs':'Audit Logs'};
const quickByRole={Admin:[['Customer','/customers?create=1'],['Product','/products?create=1'],['Challan','/challans/new'],['Stock adjustment','/products']],Sales:[['Customer','/customers?create=1'],['Follow-up','/follow-ups'],['Challan','/challans/new']],Warehouse:[['Product','/products?create=1'],['Stock adjustment','/products']],Accounts:[]};

export default function Layout({children}){
 const{user,logout}=useAuth(),navigate=useNavigate(),location=useLocation();
 const[mobile,setMobile]=useState(false),[command,setCommand]=useState(false),[notifications,setNotifications]=useState(null);
 const[collapsed,setCollapsed]=useState(()=>localStorage.getItem('orbit_sidebar_collapsed')==='true');
 const[theme,setTheme]=useState(()=>localStorage.getItem('orbit_theme')||'system');
 useEffect(()=>{localStorage.setItem('orbit_sidebar_collapsed',String(collapsed))},[collapsed]);
 useEffect(()=>{const media=matchMedia('(prefers-color-scheme: dark)');const apply=()=>{document.documentElement.dataset.theme=theme==='dark'||(theme==='system'&&media.matches)?'dark':'light';document.documentElement.dataset.themePreference=theme};apply();localStorage.setItem('orbit_theme',theme);media.addEventListener('change',apply);return()=>media.removeEventListener('change',apply)},[theme]);
 useEffect(()=>setMobile(false),[location.pathname]);
 useEffect(()=>{const onKey=event=>{if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='k'){event.preventDefault();setCommand(true)}if(event.key==='Escape')setCommand(false)};addEventListener('keydown',onKey);return()=>removeEventListener('keydown',onKey)},[]);
 const visible=sections.map(([label,links])=>[label,links.filter(([, , ,roles])=>!roles||roles.includes(user.role))]).filter(([,links])=>links.length);
 const pageTitle=Object.entries(titles).sort((a,b)=>b[0].length-a[0].length).find(([path])=>path==='/'?location.pathname==='/':location.pathname.startsWith(path))?.[1]||'Operations workspace';
 const loadNotifications=async()=>{setNotifications({loading:true,items:[],unread:0});try{setNotifications(await api('/notifications'))}catch(error){setNotifications({error:error.message,items:[],unread:0})}};
 const toggleNotifications=()=>notifications?setNotifications(null):loadNotifications();
 const openNotification=async item=>{if(!item.read_at){try{await api(`/notifications/${item.id}/read`,{method:'PATCH'})}catch{} }setNotifications(null);navigate(item.to||'/')};
 const markAll=async()=>{await api('/notifications/read-all',{method:'PATCH'});setNotifications(value=>({...value,unread:0,items:value.items.map(item=>({...item,read_at:item.read_at||new Date().toISOString()}))}))};
 const quick=quickByRole[user.role];
 return <div className={`app-shell ${collapsed?'sidebar-collapsed':''}`}>
  <aside className={mobile?'open':''}><div className="brand"><span>O</span><div>Orbit<small>OPERATIONS INTELLIGENCE</small></div><button aria-label="Close navigation" onClick={()=>setMobile(false)}><X/></button></div>
   <nav>{visible.map(([label,links])=><div className="nav-section" key={label}><small>{label}</small>{links.map(([to,text,Icon])=><Tooltip label={text} key={to}><NavLink to={to} end={to==='/' }><Icon/><span>{text}</span></NavLink></Tooltip>)}</div>)}</nav>
   <button className="sidebar-toggle" aria-label={collapsed?'Expand sidebar':'Collapse sidebar'} onClick={()=>setCollapsed(value=>!value)}>{collapsed?<PanelLeftOpen/>:<PanelLeftClose/>}<span>{collapsed?'Expand':'Collapse'}</span></button>
   <div className="profile"><span className="avatar">{initials(user.name)}</span><div><b>{user.name}</b><small>{user.role}</small></div><DropdownMenu label="Profile menu" trigger={<span aria-hidden="true">•••</span>} align="left"><MenuItem icon={LogOut} danger onClick={()=>{logout();navigate('/login')}}>Sign out</MenuItem></DropdownMenu></div>
  </aside>{mobile&&<div className="mobile-scrim" onClick={()=>setMobile(false)}/>}<main><header className="topbar"><button className="mobile-menu" aria-label="Open navigation" onClick={()=>setMobile(true)}><Menu/></button><div className="breadcrumb"><small>ORBIT ERP / {pageTitle.toUpperCase()}</small><b>{pageTitle}</b></div><button className="command-trigger" onClick={()=>setCommand(true)}><Search/><span>Search customers, products, challans…</span><kbd>⌘ K</kbd></button><div className="top-actions">
   <DropdownMenu label="Theme selector" trigger={theme==='light'?<Sun/>:<Moon/>}>{['light','dark','system'].map(value=><MenuItem key={value} onClick={()=>setTheme(value)}>{value[0].toUpperCase()+value.slice(1)}{theme===value?' ✓':''}</MenuItem>)}</DropdownMenu>
   <button className="notification" aria-label="Notifications" onClick={toggleNotifications}><Bell/>{notifications?.unread>0&&<i/>}</button>
   {quick.length>0&&<DropdownMenu label="Quick create" trigger={<><Plus/><span>Quick create</span></>}><div className="dropdown-label">CREATE</div>{quick.map(([label,to])=><MenuItem icon={Plus} key={label} onClick={()=>navigate(to)}>{label}</MenuItem>)}</DropdownMenu>}
   </div>{notifications&&<NotificationPanel data={notifications} close={()=>setNotifications(null)} open={openNotification} markAll={markAll}/>}</header><div className="page-container">{children}</div></main>{command&&<CommandPalette close={()=>setCommand(false)} navigate={navigate} user={user}/>}</div>;
}

function NotificationPanel({data,close,open,markAll}){return <div className="notification-panel" role="dialog" aria-label="Notifications"><header><div><b>Notifications</b><small>{data.loading?'Loading…':data.error?'Unable to load':`${data.unread} unread`}</small></div><div>{data.unread>0&&<button onClick={markAll}>Mark all read</button>}<button aria-label="Close notifications" onClick={close}><X/></button></div></header>{data.error?<p>{data.error}. Close and retry.</p>:data.loading?<p>Loading notifications…</p>:data.items.length?data.items.map(item=><button className={item.read_at?'read':''} key={item.id} onClick={()=>open(item)}><i className={item.type}/><div><b>{item.title}</b><small>{item.message}</small></div><ChevronRight/></button>):<p>Your operation is all clear.</p>}<footer><button onClick={close}>View all notifications</button></footer></div>}

function CommandPalette({close,navigate,user}){
 const[q,setQ]=useState(''),[results,setResults]=useState({customers:[],products:[],challans:[]}),[searchError,setSearchError]=useState(''),[active,setActive]=useState(0),timer=useRef();
 const create=quickByRole[user.role];
 const navigateItems=useMemo(()=>sections.flatMap(([,links])=>links).filter(([, , ,roles])=>!roles||roles.includes(user.role)).map(([to,label])=>[label,to]),[user.role]);
 const recent=useMemo(()=>{try{return JSON.parse(localStorage.getItem('orbit_recent')||'[]')}catch{return[]}},[]);
 useEffect(()=>{clearTimeout(timer.current);setSearchError('');if(q.trim().length<2){setResults({customers:[],products:[],challans:[]});return}timer.current=setTimeout(async()=>{try{setResults(await api(`/search?q=${encodeURIComponent(q.trim())}`))}catch(error){setResults({customers:[],products:[],challans:[]});setSearchError(error.message)}},180);return()=>clearTimeout(timer.current)},[q]);
 const groups=q.length>=2?[['RESULTS',[...results.customers.map(x=>[`${x.business_name} · ${x.customer_name}`,`/customers/${x.id}`]),...results.products.map(x=>[`${x.product_name} · ${x.sku}`,`/products?product=${x.id}`]),...results.challans.map(x=>[`${x.challan_number} · ${x.business_name}`,`/challans/${x.id}`])]]]:[['RECENT',recent],['CREATE',create],['NAVIGATE',navigateItems]];
 const filtered=groups.map(([label,items])=>[label,items.filter(([name])=>name.toLowerCase().includes(q.toLowerCase()))]).filter(([,items])=>items.length);const all=filtered.flatMap(([,items])=>items);
 useEffect(()=>setActive(0),[q,all.length]);const go=([label,to])=>{localStorage.setItem('orbit_recent',JSON.stringify([[label,to],...recent.filter(x=>x[1]!==to)].slice(0,5)));navigate(to);close()};
 return <div className="command-backdrop" onMouseDown={event=>event.target===event.currentTarget&&close()}><div className="command-box" role="dialog" aria-modal="true" aria-label="Command palette" onKeyDown={event=>{if(event.key==='ArrowDown'){event.preventDefault();setActive(value=>Math.min(all.length-1,value+1))}if(event.key==='ArrowUp'){event.preventDefault();setActive(value=>Math.max(0,value-1))}if(event.key==='Enter'&&all[active])go(all[active])}}><div><Search/><input autoFocus value={q} onChange={event=>setQ(event.target.value)} placeholder="Search Orbit or run a command…"/><kbd>ESC</kbd></div>{searchError?<div className="command-empty">Unable to search: {searchError}</div>:filtered.map(([label,items])=><section key={label}><p>{label}</p>{items.map(item=>{const index=all.indexOf(item);return <button className={index===active?'active':''} key={`${item[1]}-${item[0]}`} onMouseEnter={()=>setActive(index)} onClick={()=>go(item)}><Command/><span>{item[0]}</span><small>Open</small></button>})}</section>)}{!searchError&&!all.length&&<div className="command-empty">No matching customers, products, challans, or commands.</div>}</div></div>;
}
