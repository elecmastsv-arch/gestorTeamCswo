
import { useState, useEffect, useMemo } from 'react'
import { listTournaments, getTournament, saveTournament, deleteTournament, slugify } from './components/Storage'
import Background from './components/Background'
import { jsPDF } from 'jspdf'

const RESULT = { P1:'P1', P2:'P2', DRAW:'DRAW', BYE:'BYE' }
const POINTS = { WIN:3, DRAW:1, LOSS:0, BYE:3 }
const uid = (p='id') => p + '_' + Math.random().toString(36).slice(2,9)
const todayISO = () => new Date().toISOString().slice(0,10)

function emptyTournament(name='Torneo CSWO'){
  const slug = slugify(name)
  return { slug, meta:{ name, date:todayISO(), maxRounds:5 }, players:[], rounds:[], finished:false, createdAt:Date.now(), updatedAt:Date.now() }
}

function calcStandings(t){
  const res = {}
  t.players.forEach(p => res[p.id] = { id:p.id, name:p.name, points:0, wins:0, draws:0, losses:0, omw:0, _mw:0, opps:new Set(), byes:0, dropped:p.dropped })
  t.rounds.forEach(r => r.pairings.forEach(m => {
    if(!m.p2 && m.result===RESULT.BYE){ const a=res[m.p1]; if(!a) return; a.points+=POINTS.BYE; a.wins++; a.byes++; return }
    const a=res[m.p1]; const b=res[m.p2]; if(!a||!b) return
    a.opps.add(b.id); b.opps.add(a.id)
    if(!m.result) return
    if(m.result===RESULT.P1){ a.points+=POINTS.WIN; a.wins++; b.losses++ }
    else if(m.result===RESULT.P2){ b.points+=POINTS.WIN; b.wins++; a.losses++ }
    else if(m.result===RESULT.DRAW){ a.points+=POINTS.DRAW; b.points+=POINTS.DRAW; a.draws++; b.draws++ }
  }))
  const mw = p => { const tot=p.wins+p.draws+p.losses; return tot? (p.wins+0.5*p.draws)/tot : 0 }
  Object.values(res).forEach(p=>{ p._mw = mw(p) })
  Object.values(res).forEach(p=>{ const opps=[...p.opps].map(id=>res[id]?._mw||0); p.omw = opps.length? opps.reduce((a,b)=>a+b,0)/opps.length : 0 })
  return Object.values(res).sort((a,b)=> b.points-a.points || b.omw-a.omw || b.wins-a.wins || a.name.localeCompare(b.name)).map((p,i)=>({ rank:i+1, ...p }))
}

function hasPlayed(t,a,b){ return t.rounds.some(r=> r.pairings.some(m=> (m.p1===a&&m.p2===b)||(m.p1===b&&m.p2===a) )) }
function swissPairings(t){
  const base = Math.max(1, t.rounds.reduce((acc,r)=> Math.max(acc, ...(r.pairings.map(m=>m.table)) ), 0) + 1)
  const actives = t.players.filter(p=>!p.dropped)
  const st = calcStandings(t)
  const ordered = actives.map(p=>({...p, points: st.find(s=>s.id===p.id)?.points||0})).sort((a,b)=> b.points-a.points || a.name.localeCompare(b.name))
  const ids = ordered.map(p=>p.id)
  const pairs = []
  if(ordered.length % 2 === 1){
    const cand = [...ordered].reverse().find(p=> !t.rounds.some(r=> r.pairings.some(m=> m.p1===p.id && m.result===RESULT.BYE )))
    if(cand){ ids.splice(ids.indexOf(cand.id),1); pairs.push({ id:uid('m'), table: base+pairs.length, p1:cand.id, p2:null, p1Wins:0, p2Wins:0, result:RESULT.BYE }) }
  }
  while(ids.length){
    const a = ids.shift()
    let idx = ids.findIndex(b=> !hasPlayed(t,a,b) )
    if(idx===-1) idx = 0
    const b = ids.splice(idx,1)[0]
    if(!b) break
    pairs.push({ id:uid('m'), table: base+pairs.length, p1:a, p2:b, p1Wins:0, p2Wins:0, result:null })
  }
  return pairs
}

export default function App(){
  const qp = new URLSearchParams(location.search)
  const viewSlug = qp.get('t')
  const isViewer = qp.has('view') || (qp.get('mode')==='view')
  const [mode, setMode] = useState(viewSlug && isViewer ? 'viewer' : 'selector')
  const [t, setT] = useState(()=> viewSlug ? (getTournament(viewSlug)||emptyTournament('Torneo CSWO')) : emptyTournament('Torneo CSWO'))
  useEffect(()=>{ saveTournament(t) }, [t])

  // === Nuevo manejo Drop ===
  const ensurePlayerDefaults = (p) => ({ dropped:false, droppedAt:null, dropRound:null, dropReason:'', ...p })
  useEffect(()=>{
    setT(tt => ({ ...tt, players: tt.players.map(ensurePlayerDefaults) }))
  },[])

  const byId = useMemo(()=> Object.fromEntries(t.players.map(p=>[p.id,p])) , [t.players])
  const standings = useMemo(()=> calcStandings(t), [t.players, t.rounds])
  const current = t.rounds[t.rounds.length-1]
  const roundCounter = `${t.rounds.length} / ${t.meta.maxRounds}`
  const stateLabel = t.finished ? 'FINALIZADO' : current && current.pairings.some(m=>!m.result) ? 'RONDA EN PROGRESO' : 'EN CURSO'

  const addPlayer = (nm) => {
    nm=String(nm||'').trim(); if(!nm) return;
    setT({...t, players:[...t.players, ensurePlayerDefaults({id:uid('p'), name:nm})]})
  }

  const bulkTextAdd = (txt) => {
    const list = String(txt||'').split(/\r?\n|,|;/).map(s=>s.trim()).filter(Boolean)
    if(!list.length) return
    const exist = new Set(t.players.map(p=>p.name.toLowerCase()))
    const toAdd = list.filter(n=>!exist.has(n.toLowerCase())).map(n=>ensurePlayerDefaults({id:uid('p'), name:n}))
    setT({...t, players:[...t.players, ...toAdd]})
  }

  const toggleDrop = (p) => {
    const isDrop = !p.dropped;
    const reason = isDrop ? window.prompt('Motivo del drop (opcional):', '') ?? '' : '';
    setT({
      ...t,
      players: t.players.map(x =>
        x.id === p.id ? {
          ...x,
          dropped: isDrop,
          droppedAt: isDrop ? Date.now() : null,
          dropRound: isDrop ? t.rounds.length : null,
          dropReason: isDrop ? reason : ''
        } : x
      )
    });
  }

  // === UI ===
  return (
    <div className='min-h-screen text-white'>
      <Background/>
      <main className='max-w-6xl mx-auto px-4 py-6'>
        <section className='card'>
          <h3 className='text-lg font-semibold text-cyan-300'>Jugadores ({t.players.length})</h3>
          <ul className='mt-4 grid md:grid-cols-2 gap-2'>
            {t.players.map(p=>(
              <li key={p.id} className={`bg-white/5 border border-white/10 rounded-xl px-3 py-2 flex items-center justify-between ${p.dropped?'opacity-60':''}`}>
                <span className='flex items-center gap-2'>
                  {p.dropped && <span className='text-xs text-red-400'>(Drop)</span>}
                  <span>{p.name}</span>
                </span>
                <div className='flex items-center gap-3'>
                  <button className='text-sm text-yellow-300 hover:underline' onClick={()=> toggleDrop(p)}>
                    {p.dropped ? 'Reintegrar' : 'Drop'}
                  </button>
                  <button className='text-sm text-red-300 hover:underline' onClick={()=> setT({...t, players:t.players.filter(x=>x.id!==p.id)})}>Eliminar</button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      </main>
    </div>
  )
}
