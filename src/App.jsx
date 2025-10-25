
import React, { useEffect, useMemo, useState } from 'react'
import jsPDF from 'jspdf'
import Background from './components/Background'
import Selector from './components/TournamentSelector'
import { listTournaments, getTournament, saveTournament, deleteTournament, slugify } from './components/Storage'

const RESULT = { P1:'P1', P2:'P2', DRAW:'DRAW', BYE:'BYE' }
const POINTS = { WIN:3, DRAW:1, LOSS:0, BYE:3 }
const uid = (p='id') => p + '_' + Math.random().toString(36).slice(2,9)
const todayISO = () => new Date().toISOString().slice(0,10)

function emptyTournament(name='Mi Torneo CSWO'){
  const slug = slugify(name)
  return { slug, meta:{ name, date:todayISO(), maxRounds:5 }, players:[], rounds:[], finished:false, createdAt:Date.now(), updatedAt:Date.now() }
}
function calcStandings(t){
  const res = {}
  t.players.forEach(p => res[p.id] = { id:p.id, name:p.name, points:0, wins:0, draws:0, losses:0, omw:0, _mw:0, opps:new Set(), byes:0 })
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
  Object.values(res).forEach(p => p._mw = mw(p))
  Object.values(res).forEach(p => { const o=[...p.opps]; p.omw = o.length? o.reduce((acc,id)=>acc+(res[id]?._mw||0),0)/o.length : 0 })
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
function determineResult(m){
  if(!m.p2) return RESULT.BYE
  if(m.p1Wins>m.p2Wins) return RESULT.P1
  if(m.p2Wins>m.p1Wins) return RESULT.P2
  if(m.p1Wins===m.p2Wins && (m.p1Wins>0||m.p2Wins>0)) return RESULT.DRAW
  return null
}

export default function App(){
  const qp = new URLSearchParams(location.search)
  const viewSlug = qp.get('t')
  const isViewer = qp.has('view') || (qp.get('mode')==='view')

  const [mode, setMode] = useState(viewSlug && isViewer ? 'viewer' : 'selector')
  const [t, setT] = useState(()=> viewSlug ? (getTournament(viewSlug)||emptyTournament('Torneo CSWO')) : emptyTournament('Torneo CSWO'))
  useEffect(()=>{ saveTournament(t) }, [t])

  const byId = useMemo(()=> Object.fromEntries(t.players.map(p=>[p.id,p])) , [t.players])
  const standings = useMemo(()=> calcStandings(t), [t.players, t.rounds])
  const current = t.rounds[t.rounds.length-1]
  const roundCounter = `${t.rounds.length} / ${t.meta.maxRounds}`
  const stateLabel = t.finished ? 'FINALIZADO' : current && current.pairings.some(m=>!m.result) ? 'RONDA EN PROGRESO' : 'EN CURSO'

  // actions
  const addPlayer = (nm) => { nm=String(nm||'').trim(); if(!nm) return; setT({...t, players:[...t.players, {id:uid('p'), name:nm, dropped:false}]}) }
  const bulkTextAdd = (txt) => {
    const list = String(txt||'').split(/\\r?\\n|,|;/).map(s=>s.trim()).filter(Boolean)
    if(!list.length) return
    const exist = new Set(t.players.map(p=>p.name.toLowerCase()))
    const toAdd = list.filter(n=>!exist.has(n.toLowerCase())).map(n=>({id:uid('p'), name:n, dropped:false}))
    setT({...t, players:[...t.players, ...toAdd]})
  }
  const startRound = () => {
    if(t.players.length<2) return alert('Agrega al menos 2 jugadores')
    if(current && current.pairings.some(m=>!m.result)) return alert('Faltan resultados')
    const pairs = swissPairings(t)
    setT({...t, rounds:[...t.rounds, {number:t.rounds.length+1, pairings:pairs}], finished:false})
  }
  const updateScore = (rid,mid,field,val) => {
    setT({...t, rounds: t.rounds.map(r=> r.number!==rid? r : ({...r, pairings: r.pairings.map(m=> m.id!==mid? m : ({...m, [field]: Math.max(0, Math.min(3, parseInt(val||0))) }))}))})
  }
  const saveResult = (rid,mid) => {
    setT({...t, rounds: t.rounds.map(r=> r.number!==rid? r : ({...r, pairings: r.pairings.map(m=> m.id!==mid? m : ({...m, result: determineResult(m) }))}))})
  }
  const finish = () => {
    if(t.rounds.some(r=> r.pairings.some(m=> m.p2 && !m.result))) return alert('Hay partidas sin resultado')
    setT({...t, finished:true})
  }
  const exportPDF = (type) => {
    const doc = new jsPDF()
    doc.setFont('helvetica','bold'); doc.setFontSize(18); doc.setTextColor(0,191,255)
    doc.text('COMUNIDAD CSWO — Arena Manager', 105, 16, { align:'center' })
    doc.setDrawColor(0,191,255); doc.line(15,18,195,18)
    doc.setFont('helvetica','normal'); doc.setFontSize(10); doc.setTextColor(0,0,0)
    doc.text(`Torneo: ${t.meta.name}`, 16, 24); doc.text(`Fecha: ${t.meta.date}`, 100, 24); doc.text(`Ronda: ${roundCounter}`, 160, 24)
    let y = 32

    if(type==='rounds'){
      t.rounds.forEach(r => {
        doc.setFont('helvetica','bold'); doc.setFontSize(12); doc.text(`Ronda ${r.number}`, 16, y); y+=6
        doc.setFont('helvetica','normal'); doc.setFontSize(11)
        r.pairings.forEach(m => {
          const p1 = byId[m.p1]?.name || '??'
          const p2 = m.p2? (byId[m.p2]?.name || '??') : 'BYE'
          const res = m.result===RESULT.P1? 'Gana A' : m.result===RESULT.P2? 'Gana B' : m.result===RESULT.DRAW? 'Empate' : ''
          doc.text(`Mesa ${m.table}: ${p1} (${m.p1Wins||0}) vs ${p2} (${m.p2Wins||0}) ${res}`, 20, y); y+=6
          if (y>280) { doc.addPage(); y=20 }
        })
        y+=4; if (y>280) { doc.addPage(); y=20 }
      })
      doc.setFont('helvetica','italic'); doc.setTextColor(0,0,0); doc.text('By CSWO Team', 105, 290, {align:'center'})
      doc.save('CSWO_Rondas.pdf'); return
    }

    const st = standings
    doc.setFont('helvetica','bold'); doc.setFontSize(12); doc.text('Clasificación', 16, y); y+=6
    doc.text('#',16,y); doc.text('Jugador',24,y); doc.text('Pts',120,y); doc.text('W',140,y); doc.text('D',150,y); doc.text('L',160,y); doc.text('OMW%',174,y,{align:'right'}); y+=4
    doc.setDrawColor(150); doc.line(16,y,194,y); y+=6
    doc.setFont('helvetica','normal')
    st.forEach(p=>{ doc.text(String(p.rank),16,y); doc.text(p.name,24,y); doc.text(String(p.points),120,y); doc.text(String(p.wins),140,y); doc.text(String(p.draws),150,y); doc.text(String(p.losses),160,y); doc.text((p.omw*100).toFixed(1),174,y,{align:'right'}); y+=6; if(y>280){ doc.addPage(); y=20 } })
    doc.setFont('helvetica','italic'); doc.setTextColor(0,0,0); doc.text('By CSWO Team', 105, 290, {align:'center'})
    doc.save(type==='final' ? 'CSWO_Clasificacion_Final.pdf' : 'CSWO_Clasificacion.pdf')
  }
  const genLink = () => {
    const url = new URL(location.href)
    url.searchParams.set('t', t.slug); url.searchParams.set('view','1')
    navigator.clipboard.writeText(url.toString()); alert('Enlace copiado:\\n'+url.toString())
  }

  if(mode==='selector'){
    return <Selector onCreate={(name)=>{ const nt=emptyTournament(name); saveTournament(nt); setT(nt); setMode('organizer') }}
                     onOpen={(slug)=>{ const nt=getTournament(slug); if(nt){ setT(nt); setMode('organizer') } }}
                     onDelete={(slug)=>{ deleteTournament(slug); location.reload() }} />
  }

  if(viewSlug && (isViewer || mode==='viewer')){
    return (
      <div className='min-h-screen text-white'>
        <Background/>
        <header className='sticky top-0 z-10 backdrop-blur bg-black/40 border-b border-white/10'>
          <div className='max-w-6xl mx-auto px-4 py-4 flex items-center justify-between'>
            <h1 className='text-2xl font-extrabold neon-title'>COMUNIDAD CSWO</h1>
            <Status label={stateLabel} round={roundCounter} />
          </div>
        </header>
        <main className='max-w-6xl mx-auto px-4 py-6'>
          <section className='card'>
            <h2 className='text-xl font-bold text-cyan-300'>Torneo: {t.meta.name}</h2>
            <p className='text-gray-300 text-sm'>Fecha: {t.meta.date}</p>
          </section>
          <section className='card mt-4'>
            <h3 className='text-lg font-semibold text-cyan-300'>Rondas</h3>
            {t.rounds.length===0? <p className='text-gray-400'>Aún no hay rondas.</p> :
              t.rounds.map(r=>(
                <details key={r.number} className='mt-2 bg-white/5 rounded-xl p-3 border border-white/10' open>
                  <summary className='cursor-pointer select-none'>Ronda {r.number}</summary>
                  <div className='mt-2 space-y-2'>
                    {r.pairings.map(m=>{
                      const p1=byId[m.p1]?.name||'??'; const p2=m.p2? (byId[m.p2]?.name||'??') : 'BYE'
                      return (
                        <div key={m.id} className='flex flex-wrap items-center justify-between border-b border-white/10 pb-2'>
                          <div><span className='text-gray-400 text-xs mr-2'>Mesa {m.table}</span>{p1} vs {p2}</div>
                          <div className='text-sm text-gray-300'>{m.p1Wins||0} - {m.p2Wins||0} {m.result? `• ${m.result==='P1'?'Gana A':m.result==='P2'?'Gana B':'Empate'}`:''}</div>
                        </div>
                      )
                    })}
                  </div>
                </details>
              ))
            }
          </section>
          <section className='card mt-4'>
            <h3 className='text-lg font-semibold text-cyan-300'>Clasificación</h3>
            {standings.length===0? <p className='text-gray-400'>Sin datos aún.</p> :
              <table className='w-full text-left border-collapse mt-2'>
                <thead><tr className='table-head'><th>#</th><th>Jugador</th><th>Pts</th><th>W</th><th>D</th><th>L</th><th>OMW%</th></tr></thead>
                <tbody>{standings.map(p=>(
                  <tr key={p.id} className={`border-b border-white/10 ${p.rank<=3?'bg-cyan-500/10':''}`}>
                    <td>{p.rank}</td><td>{p.name}</td><td>{p.points}</td><td>{p.wins}</td><td>{p.draws}</td><td>{p.losses}</td><td>{(p.omw*100).toFixed(1)}</td>
                  </tr>
                ))}</tbody>
              </table>
            }
          </section>
        </main>
        <footer className='text-center text-xs text-gray-400 py-8'>By CSWO Team</footer>
      </div>
    )
  }

  // Organizer UI
  return (
    <div className='min-h-screen text-white'>
      <Background/>
      <header className='sticky top-0 z-10 backdrop-blur bg-black/40 border-b border-white/10'>
        <div className='max-w-6xl mx-auto px-4 py-4 flex items-center justify-between'>
          <h1 className='text-2xl md:text-3xl font-extrabold neon-title'>COMUNIDAD CSWO</h1>
          <Status label={stateLabel} round={roundCounter} />
        </div>
      </header>
      <main className='max-w-6xl mx-auto px-4 py-6'>
        <section className='card'>
          <div className='flex items-center justify-between gap-3'>
            <div>
              <h2 className='text-xl font-bold text-cyan-300'>Arena CSWO Manager</h2>
              <p className='text-gray-300 text-sm'>Gestor de torneos TCG — Tema azul neón.</p>
            </div>
            <div className='flex gap-2'>
              <button className='btn' onClick={genLink}>Generar enlace público</button>
              <button className='btn-ghost' onClick={()=>exportPDF('standings')}>PDF Clasificación</button>
            </div>
          </div>
          <div className='grid md:grid-cols-3 gap-3 mt-4'>
            <div>
              <label className='text-sm text-gray-400'>Nombre del torneo</label>
              <input className='input' value={t.meta.name} onChange={e=> setT({...t, meta:{...t.meta, name:e.target.value}, slug:slugify(e.target.value)}) } />
            </div>
            <div>
              <label className='text-sm text-gray-400'>Fecha</label>
              <input type='date' className='input' value={t.meta.date} onChange={e=> setT({...t, meta:{...t.meta, date:e.target.value}}) } />
            </div>
            <div>
              <label className='text-sm text-gray-400'>Rondas máximas</label>
              <input type='number' min={1} className='input' value={t.meta.maxRounds} onChange={e=> setT({...t, meta:{...t.meta, maxRounds: Math.max(1, parseInt(e.target.value||1))}}) } />
            </div>
          </div>
        </section>

        <section className='card mt-4'>
          <div className='flex items-center justify-between'>
            <h3 className='text-lg font-semibold text-cyan-300'>Jugadores ({t.players.length})</h3>
            <div className='flex gap-2'>
              <label className='btn-ghost cursor-pointer'>Importar CSV
                <input type='file' accept='.csv,.txt' className='hidden' onChange={e=>{ const f=e.target.files?.[0]; if(f) f.text().then(txt=>bulkTextAdd(txt)) }}/>
              </label>
              <button className='btn-ghost' onClick={()=>{
                const data = JSON.stringify(t,null,2)
                const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([data],{type:'application/json'})); a.download=`${t.slug}.json`; a.click(); URL.revokeObjectURL(a.href)
              }}>Exportar JSON</button>
              <label className='btn-ghost cursor-pointer'>Importar JSON
                <input type='file' accept='application/json' className='hidden' onChange={async e=>{
                  const f=e.target.files?.[0]; if(!f) return; const txt=await f.text(); try{ const obj=JSON.parse(txt); setT(obj) } catch{ alert('JSON inválido') }
                }}/>
              </label>
            </div>
          </div>
          <div className='flex gap-2 mt-3'>
            <input className='input flex-1' placeholder='Nombre del jugador' onKeyDown={e=>{ if(e.key==='Enter'){ addPlayer(e.currentTarget.value); e.currentTarget.value='' } }} />
            <button className='btn' onClick={()=>{ const inp=document.querySelector('input[placeholder=\"Nombre del jugador\"]'); addPlayer(inp?.value||''); if(inp) inp.value='' }}>Añadir</button>
          </div>
          <details className='mt-3'>
            <summary className='cursor-pointer select-none text-sm text-gray-300'>📋 Carga masiva (pega una lista y pulsa “Agregar todo”)</summary>
            <textarea className='input mt-2 min-h-[120px]' id='bulkArea' placeholder='Una por línea, o separadas por coma'></textarea>
            <button className='btn mt-2' onClick={()=>{ const ta=document.getElementById('bulkArea'); if(ta) { bulkTextAdd(ta.value); ta.value='' } }}>Agregar todo</button>
          </details>
          <ul className='mt-4 grid md:grid-cols-2 gap-2'>
            {t.players.map(p=>(
              <li key={p.id} className='bg-white/5 border border-white/10 rounded-xl px-3 py-2 flex items-center justify-between'>
                <span>{p.name}</span>
                <button className='text-sm text-red-300 hover:underline' onClick={()=> setT({...t, players:t.players.filter(x=>x.id!==p.id)})}>Eliminar</button>
              </li>
            ))}
          </ul>
        </section>

        <section className='card mt-4'>
          <div className='flex items-center justify-between gap-2'>
            <h3 className='text-lg font-semibold text-cyan-300'>Torneo</h3>
            <div className='flex gap-2'>
              <button className='btn' onClick={startRound}>Nueva ronda</button>
              <button className='btn-ghost' onClick={()=>exportPDF('rounds')}>PDF Rondas</button>
              {!t.finished && <button className='btn-ghost' onClick={finish}>Finalizar torneo</button>}
            </div>
          </div>
          {t.rounds.length===0 && <p className='text-gray-400 mt-2'>Aún no hay rondas.</p>}
          {t.rounds.map(r=>(
            <div key={r.number} className='mt-4'>
              <h4 className='text-cyan-300 font-semibold mb-2'>Ronda {r.number}</h4>
              {r.pairings.map(m=>{
                const p1=byId[m.p1]?.name||'??'; const p2=m.p2? (byId[m.p2]?.name||'??') : 'BYE'
                const dis = !m.p2
                return (
                  <div key={m.id} className='grid md:grid-cols-12 gap-2 items-center border-b border-white/10 py-2'>
                    <div className='md:col-span-4'><span className='text-xs text-gray-400 mr-2'>Mesa {m.table}</span>{p1} vs {p2}</div>
                    <div className='md:col-span-6 grid grid-cols-2 gap-2'>
                      <div className='flex items-center gap-2'><span className='text-sm text-gray-400'>A</span>
                        <input type='number' min={0} max={3} disabled={dis} className='input' value={m.p1Wins||0} onChange={e=> updateScore(r.number,m.id,'p1Wins',e.target.value) }/></div>
                      <div className='flex items-center gap-2'><span className='text-sm text-gray-400'>B</span>
                        <input type='number' min={0} max={3} disabled={dis} className='input' value={m.p2Wins||0} onChange={e=> updateScore(r.number,m.id,'p2Wins',e.target.value) }/></div>
                    </div>
                    <div className='md:col-span-2 flex items-center gap-2'>
                      <button className='btn' disabled={dis} onClick={()=> saveResult(r.number,m.id) }>Guardar</button>
                      {m.result && <span className='text-xs text-gray-300'>{m.result==='P1'?'Gana A':m.result==='P2'?'Gana B':'Empate'}</span>}
                    </div>
                  </div>
                )
              })}
            </div>
          ))}
        </section>

        <section className='card mt-4'>
          <div className='flex items-center justify-between'>
            <h3 className='text-lg font-semibold text-cyan-300'>Clasificación</h3>
            <div className='text-sm text-cyan-200/90'><Status label={stateLabel} round={roundCounter} /></div>
          </div>
          {standings.length===0? <p className='text-gray-400 mt-2'>Sin datos aún.</p> :
            <table className='w-full text-left border-collapse mt-2'>
              <thead><tr className='table-head'><th>#</th><th>Jugador</th><th>Pts</th><th>W</th><th>D</th><th>L</th><th>OMW%</th></tr></thead>
              <tbody>{standings.map(p=>(
                <tr key={p.id} className={`border-b border-white/10 ${p.rank<=3?'bg-cyan-500/10':''}`}>
                  <td>{p.rank}</td><td>{p.name}</td><td>{p.points}</td><td>{p.wins}</td><td>{p.draws}</td><td>{p.losses}</td><td>{(p.omw*100).toFixed(1)}</td>
                </tr>
              ))}</tbody>
            </table>
          }
        </section>
      </main>
      <footer className='text-center text-xs text-gray-400 py-8'>By CSWO Team</footer>
    </div>
  )
}

function Status({label, round}){
  const color = label==='FINALIZADO' ? 'bg-red-600/30 border-red-400/50' : label==='RONDA EN PROGRESO' ? 'bg-yellow-500/20 border-yellow-400/50' : 'bg-cyan-600/20 border-cyan-400/50'
  const dot = label==='FINALIZADO' ? 'bg-red-400' : label==='RONDA EN PROGRESO' ? 'bg-yellow-300' : 'bg-cyan-300'
  return (
    <div className={`flex items-center gap-3 px-3 py-2 rounded-xl border ${color}`}>
      <span className={`inline-block w-2.5 h-2.5 rounded-full animate-pulse ${dot}`} />
      <span className='uppercase tracking-wide text-xs'>{label}</span>
      <span className='text-xs text-gray-300'>• Ronda {round}</span>
    </div>
  )
}

export default App
