"use client";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

let textCanvas:HTMLCanvasElement|undefined;

export function ExpandingTaskLabel({ title, width, height, active, completed=false, compact=false, onScaleChange }:{compact?:boolean;title:string;width:number;height:number;active:boolean;completed?:boolean;onScaleChange?:(scale:number)=>void}) {
  const measure=useRef<HTMLSpanElement>(null);
  const label=useRef<HTMLSpanElement>(null);
  const [compactTitle,setCompactTitle]=useState(title);
  useLayoutEffect(()=>{
    if(!compact)return;
    let alive=true;
    const update=()=>{
      const element=label.current;if(!alive||!element)return;
      textCanvas??=document.createElement("canvas");
      const context=textCanvas.getContext("2d");if(!context)return;
      const style=getComputedStyle(element);
      context.font=style.font||`${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
      const available=element.getBoundingClientRect().width;
      if(context.measureText(title).width<=available){setCompactTitle(title);return;}
      const chars=Array.from(new Intl.Segmenter(undefined,{granularity:"grapheme"}).segment(title),part=>part.segment);
      let low=0,high=chars.length;
      while(low<high){const mid=Math.ceil((low+high)/2);if(context.measureText(chars.slice(0,mid).join("")+"..").width<=available)low=mid;else high=mid-1;}
      setCompactTitle(chars.slice(0,low).join("")+"..");
    };
    update();
    const observer=new ResizeObserver(update);if(label.current)observer.observe(label.current);
    void document.fonts.ready.then(update);
    return()=>{alive=false;observer.disconnect();};
  },[title,width,compact]);
  const [scale,setScale]=useState(1);
  useEffect(()=>{
    let alive=true;
    const calculate=()=>{
    if(!alive)return;
    const element=measure.current;if(!element)return;
    const fits=(value:number)=>{
      element.style.width=`${Math.max(1,width*value-16)}px`;
      return element.scrollHeight<=height*value-8;
    };
    if(fits(1)){setScale(1);return;}
    let low=1,high=2;
    while(!fits(high))high*=2;
    for(let i=0;i<14;i++){const middle=(low+high)/2;if(fits(middle))high=middle;else low=middle;}
    setScale(high+.01);
    };
    calculate();
    void document.fonts.ready.then(calculate);
    return()=>{alive=false;};
  },[title,width,height]);
  useEffect(()=>{onScaleChange?.(scale);},[scale]);
  const expanded=active;
  const size=expanded?Math.max(scale,1.06):1;
  return <>
    <span ref={label} className={`pointer-events-none min-w-0 flex-1 overflow-hidden whitespace-nowrap ${compact?"":"text-ellipsis"}`} style={{opacity:expanded?0:1,textDecoration:completed?"line-through":undefined}}>{compact?compactTitle:title}</span>
    <span ref={measure} aria-hidden="true" className="pointer-events-none invisible absolute block whitespace-normal break-words leading-4" style={{width:Math.max(1,width-16)}}>{title}</span>
    <span aria-hidden="true" className={`task-label-expansion absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center overflow-hidden ${expanded?"pointer-events-auto":"pointer-events-none"}`} style={{width:width*size,height:height*size,opacity:expanded?1:0}}>
      <span className="block w-full whitespace-normal break-words leading-4" style={{textDecoration:completed?"line-through":undefined}}>{title}</span>
    </span>
  </>;
}
