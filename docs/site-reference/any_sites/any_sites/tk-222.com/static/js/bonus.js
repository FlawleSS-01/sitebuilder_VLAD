
(function(){
  const canvas=document.getElementById('hexGrid');
  if(!canvas)return;
  const ctx=canvas.getContext('2d');
  function resize(){canvas.width=window.innerWidth;canvas.height=window.innerHeight}
  resize();window.addEventListener('resize',resize);
  const size=24, h= Math.sin(Math.PI/3)*size*2;
  function draw(){
    ctx.clearRect(0,0,canvas.width,canvas.height);
    ctx.strokeStyle='rgba(255,255,255,0.06)';
    ctx.lineWidth=1;
    for(let y=0;y<canvas.height+h;y+=h){
      for(let x=0;x<canvas.width+size*3;x+=size*3){
        const offset=(Math.floor(y/h)%2)*1.5*size;
        ctx.beginPath();
        for(let i=0;i<6;i++){
          const angle=Math.PI/3*i;
          const px=x+offset+size*Math.cos(angle);
          const py=y+size*Math.sin(angle);
          if(i===0)ctx.moveTo(px,py);else ctx.lineTo(px,py);
        }
        ctx.closePath();
        ctx.stroke();
      }
    }
    requestAnimationFrame(draw);
  }
  draw();
})();