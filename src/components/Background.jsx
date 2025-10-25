import React from 'react'
export default function Background(){
  return (<div className='fixed inset-0 -z-10' aria-hidden>
    <div className='absolute inset-0 bg-gradient-to-b from-[#020617] via-[#0a0f24] to-black'/>
    <div className='absolute -top-40 -left-40 w-[600px] h-[600px] bg-[rgba(0,191,255,0.18)] rounded-full blur-[120px] animate-float'/>
    <div className='absolute bottom-0 right-0 w-[520px] h-[520px] bg-[rgba(94,241,255,0.16)] rounded-full blur-[110px] animate-float' style={{animationDelay:'-4s'}}/>
    {Array.from({length:36}).map((_,i)=>(
      <span key={i} className='pointer-events-none absolute w-1 h-1 bg-cyan-300/70 rounded-full'
        style={{left:(i*7)%100+'%',top:(i*13)%100+'%',filter:'blur(.2px)',animation:'float 14s ease-in-out infinite',animationDelay:(-i*0.25)+'s'}}/>
    ))}
  </div>)
}
