import React,{useState} from 'react'
import Background from './Background'
import { listTournaments } from './Storage'

export default function TournamentSelector({ onCreate, onOpen, onDelete }){
  const [name,setName]=useState('Mi Torneo CSWO')
  const items=listTournaments()
  return (
    <div className='min-h-screen text-white'>
      <Background/>
      <div className='max-w-4xl mx-auto px-4 py-12'>
        <h1 className='neon-title text-center text-3xl font-extrabold'>COMUNIDAD CSWO</h1>
        <p className='text-center text-gray-300 mt-2'>Selecciona un torneo o crea uno nuevo</p>

        <div className='card mt-6'>
          <div className='grid md:grid-cols-3 gap-3'>
            <input className='input md:col-span-2' value={name} onChange={e=>setName(e.target.value)} placeholder='Nombre del torneo' />
            <button className='btn' onClick={()=> onCreate(name)}>Nuevo torneo</button>
          </div>
        </div>

        <div className='card mt-4'>
          <h2 className='text-lg font-semibold text-cyan-300'>Torneos guardados</h2>
          {items.length===0? <p className='text-gray-400 mt-2'>Aún no hay torneos guardados.</p> :
            <ul className='mt-3 grid md:grid-cols-2 gap-3'>
              {items.map(t=>(
                <li key={t.slug} className='bg-white/5 border border-white/10 rounded-xl p-3'>
                  <div className='flex items-center justify-between gap-2'>
                    <div>
                      <div className='font-semibold'>{t.meta?.name||t.slug}</div>
                      <div className='text-xs text-gray-400'>Fecha: {t.meta?.date||'-'} • Última act.: {new Date(t.updatedAt||0).toLocaleString()}</div>
                    </div>
                    <div className='flex gap-2'>
                      <button className='btn' onClick={()=> onOpen(t.slug)}>Reanudar</button>
                      <button className='btn-ghost' onClick={()=> onDelete(t.slug)}>Eliminar</button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          }
        </div>
      </div>
      <footer className='text-center text-xs text-gray-400 py-8'>By CSWO Team</footer>
    </div>
  )
}
