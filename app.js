const canvas = document.getElementById('preview');
const ctx = canvas.getContext('2d');
const fields = Object.fromEntries(['personName','themeColor','message1','message2','message3','message4','message5','incomingCall'].map(id => [id, document.getElementById(id)]));
const durationLabel = document.getElementById('durationLabel');
const status = document.getElementById('status');
const startButton = document.getElementById('startButton');
const playback = document.getElementById('playback');
const exportButton = document.getElementById('exportButton');
const leafSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="#e8ebe7"/><path d="M26 67c0-24 19-39 47-43-2 31-18 49-42 49" fill="#758a79"/><path d="M24 77c12-19 25-30 43-43" fill="none" stroke="#e8ebe7" stroke-width="3" stroke-linecap="round"/></svg>`;
const leafIconSrc = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(leafSvg);
const icon = new Image();
icon.src = leafIconSrc;
document.getElementById('iconThumb').src = icon.src;
let iconUrl = null;
let backgroundImage = null;
let backgroundUrl = null;
let playing = false;
let recording = false;
let frameId = 0;
let currentTime = 0;
let startTime = 0;
let snapshot = null;
let hasStarted = false;
let previewAudio = null;

const chars = value => Array.from(value);
const fmt = seconds => `00:${String(Math.floor(seconds)).padStart(2,'0')}`;
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
function settings() {
  return { name: fields.personName.value || '×××', color: fields.themeColor.value,
    backgroundImage,
    m1: fields.message1.value, m2: fields.message2.value,
    m3: fields.message3.value, m4: fields.message4.value,
    m5: fields.message4.value.trim() ? fields.message5.value : '', call: fields.incomingCall.checked };
}
function messagesReady() {
  if ([fields.message1,fields.message2,fields.message3].some(field=>!field.value.trim())) {
    status.textContent='メッセージを設定してください';
    return false;
  }
  return true;
}
function timeline(s) {
  const typing2 = chars(s.m2).length * .17;
  const deleting = chars(s.m2).length * .095;
  const typing3 = chars(s.m3).length * .17;
  const a = 4.8, b = a + typing2, c = b + 4, d = c + deleting,
    e = d + 1, f = e + typing3, g = f + .55,
    read = g + 2, h = g + (s.m4.trim() ? 4 : .5), followup = h + 2;
  const messageEnd=s.m5.trim() ? followup+2.2 : h+(s.m4.trim() ? 2.2 : 1.3);
  const callAt=messageEnd+1.2;
  return {a,b,c,d,e,f,g,read,h,followup,callAt,total:s.call ? callAt+5.5 : messageEnd};
}
function hexRgb(hex) { const n = parseInt(hex.slice(1),16); return {r:(n>>16)&255,g:(n>>8)&255,b:n&255}; }
function mix(a,b,p) { const c=hexRgb(a),d=hexRgb(b); return `rgb(${Math.round(c.r+(d.r-c.r)*p)},${Math.round(c.g+(d.g-c.g)*p)},${Math.round(c.b+(d.b-c.b)*p)})`; }
function rounded(x,y,w,h,r,fill) { ctx.fillStyle=fill;ctx.beginPath();ctx.roundRect(x,y,w,h,r);ctx.fill(); }
function line(x1,y1,x2,y2,color,width=1) { ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.strokeStyle=color;ctx.lineWidth=width;ctx.stroke(); }
function text(value,x,y,size=15,color='#292929',weight=400,align='left') { ctx.fillStyle=color;ctx.font=`${weight} ${size}px -apple-system,BlinkMacSystemFont,"Hiragino Kaku Gothic ProN","Yu Gothic",sans-serif`;ctx.textAlign=align;ctx.textBaseline='middle';ctx.fillText(value,x,y); }
function wrap(value,maxWidth,fontSize=16) {
  ctx.font=`400 ${fontSize}px -apple-system,BlinkMacSystemFont,"Hiragino Kaku Gothic ProN","Yu Gothic",sans-serif`;
  const lines=[];
  for (const paragraph of value.split('\n')) {
    let row='';
    for (const ch of chars(paragraph)) {
      if (ctx.measureText(row+ch).width > maxWidth && row) { lines.push(row); row=ch; } else row+=ch;
    }
    lines.push(row);
  }
  return lines;
}
function bubble(value,x,y,maxWidth,fill,side='left') {
  const lines=wrap(value, maxWidth-28);
  const longest=Math.max(34,...lines.map(v=>ctx.measureText(v).width));
  const w=Math.min(maxWidth,longest+28), h=Math.max(42,lines.length*23+18);
  const bx=side==='right' ? x-w : x;
  rounded(bx,y,w,h,17,fill);
  lines.forEach((row,i)=>text(row,bx+14,y+20+i*23,16,'#303234'));
  return h;
}
function bubbleHeight(value,maxWidth) { return Math.max(42,wrap(value,maxWidth-28).length*23+18); }
function smooth(progress) { const p=clamp(progress,0,1);return p*p*(3-2*p); }
function avatar(x,y,size) {
  ctx.save();ctx.beginPath();ctx.arc(x+size/2,y+size/2,size/2,0,Math.PI*2);ctx.clip();
  if (icon.complete && icon.naturalWidth) ctx.drawImage(icon,x,y,size,size);
  else {ctx.fillStyle='#e8ebe7';ctx.fillRect(x,y,size,size);}
  ctx.restore();
}
function callButton(x,y,fill,decline) {
  rounded(x-31,y-31,62,62,31,fill);
  ctx.save();ctx.translate(x,y);if(decline)ctx.rotate(Math.PI*5/6);
  ctx.strokeStyle='#ffffff';ctx.lineWidth=7;ctx.lineCap='round';
  ctx.beginPath();ctx.moveTo(-14,8);ctx.quadraticCurveTo(0,-9,14,8);ctx.stroke();
  ctx.restore();
}
function drawIncomingCall(t,s,tl) {
  const appear=smooth((t-tl.callAt)/.45);
  ctx.save();ctx.globalAlpha=appear;
  const gradient=ctx.createLinearGradient(0,0,390,528);
  gradient.addColorStop(0,mix(s.color,'#20242a',.55));
  gradient.addColorStop(1,mix(s.color,'#101215',.78));
  ctx.fillStyle=gradient;ctx.fillRect(0,0,390,528);
  text('着信中…',195,88,14,'#ffffff',400,'center');
  const pulse=(Math.sin((t-tl.callAt)*Math.PI*2/1.35)+1)/2;
  ctx.beginPath();ctx.arc(195,171,53+pulse*9,0,Math.PI*2);
  ctx.strokeStyle=`rgba(255,255,255,${.12+pulse*.24})`;
  ctx.lineWidth=2;ctx.stroke();
  avatar(147,123,96);
  ctx.font='600 28px sans-serif';
  const nameSize=Math.min(28,28*320/Math.max(320,ctx.measureText(s.name).width));
  text(s.name,195,257,nameSize,'#ffffff',600,'center');
  callButton(100,426,'#da5a59',true);
  callButton(290,426,'#53a878',false);
  text('拒否',100,481,13,'#ffffff',400,'center');
  text('応答',290,481,13,'#ffffff',400,'center');
  rounded(145,514,100,4,2,'#ffffff');
  ctx.restore();
}
function draw(t,s) {
  const tl=timeline(s), theme=s.color;
  ctx.setTransform(2,0,0,2,0,0);
  if(s.call && t>=tl.callAt+.45){
    drawIncomingCall(t,s,tl);
    return;
  }
  ctx.fillStyle=mix(theme,'#ffffff',.95);ctx.fillRect(0,0,390,528);
  ctx.fillStyle=mix(theme,'#ffffff',.88);ctx.fillRect(0,0,390,64);
  line(0,63,390,63,mix(theme,'#ffffff',.7));
  text('‹',20,33,34,mix(theme,'#242424',.18),300);
  text(s.name,195,33,17,'#292929',600,'center');
  text('•••',364,34,17,mix(theme,'#242424',.18),600,'right');
  const h1=bubbleHeight(s.m1 || '　',268);
  const h3=bubbleHeight(s.m3 || '　',276);
  const h4=bubbleHeight(s.m4,268);
  const h5=bubbleHeight(s.m5,268);
  const y1=136,y3=y1+h1+44,y4=y3+h3+32,y5=y4+h4+17;
  const viewportBottom=438, padding=14;
  const firstScroll=Math.max(0,y1+h1+padding-viewportBottom);
  const sentScroll=Math.max(firstScroll,y3+h3+30-viewportBottom);
  const replyScroll=Math.max(sentScroll,y4+h4+padding-viewportBottom);
  const followupScroll=Math.max(replyScroll,y5+h5+padding-viewportBottom);
  let scroll=firstScroll*smooth((t-.35)/.9);
  if(t>=tl.g)scroll+=(sentScroll-firstScroll)*smooth((t-tl.g)/.7);
  if(s.m4.trim()&&t>=tl.h)scroll+=(replyScroll-sentScroll)*smooth((t-tl.h)/.7);
  if(s.m5.trim()&&t>=tl.followup)scroll+=(followupScroll-replyScroll)*smooth((t-tl.followup)/.7);
  ctx.save();ctx.beginPath();ctx.rect(0,64,390,374);ctx.clip();
  if(s.backgroundImage){
    const image=s.backgroundImage;
    const scale=Math.max(390/image.naturalWidth,374/image.naturalHeight);
    const width=image.naturalWidth*scale,height=image.naturalHeight*scale;
    ctx.drawImage(image,(390-width)/2,64+(374-height)/2,width,height);
  }
  ctx.translate(0,-scroll);
  text('TODAY',195,104,10,mix(theme,'#666666',.45),500,'center');
  if (t>=.35) {
    const arrival=smooth((t-.35)/.55);
    ctx.save();
    ctx.globalAlpha=arrival;
    ctx.translate(0,(1-arrival)*12);
    avatar(20,y1+2,34);
    bubble(s.m1 || '　',66,y1,268,'#ffffff');
    ctx.restore();
  }
  if (t>=tl.g) {
    bubble(s.m3 || '　',365,y3,276,mix(theme,'#ffffff',.78),'right');
  }
  if (s.m4.trim() && t>=tl.read) {
    text('既読',354,y3+h3+17,10,'#aaaaaa',400,'right');
  }
  if (s.m4.trim() && t>=tl.h) {
    avatar(20,y4+2,34);
    bubble(s.m4,66,y4,268,'#ffffff');
  }
  if (s.m5.trim() && t>=tl.followup) {
    avatar(20,y5+2,34);
    bubble(s.m5,66,y5,268,'#ffffff');
  }
  ctx.restore();
  const inputTop=438;
  ctx.fillStyle=mix(theme,'#ffffff',.88);ctx.fillRect(0,inputTop,390,90);
  line(0,inputTop,390,inputTop,mix(theme,'#ffffff',.72));
  rounded(20,451,306,46,23,'#ffffff');
  ctx.strokeStyle=mix(theme,'#ffffff',.6);ctx.lineWidth=1;ctx.beginPath();ctx.roundRect(20,451,306,46,23);ctx.stroke();
  let typed='';
  if (t>=tl.a && t<tl.b) typed=chars(s.m2).slice(0,Math.floor((t-tl.a)/.17)+1).join('');
  else if (t>=tl.b && t<tl.c) typed=s.m2;
  else if (t>=tl.c && t<tl.d) typed=chars(s.m2).slice(0,Math.max(0,chars(s.m2).length-Math.floor((t-tl.c)/.095)-1)).join('');
  else if (t>=tl.e && t<tl.f) typed=chars(s.m3).slice(0,Math.floor((t-tl.e)/.17)+1).join('');
  else if (t>=tl.f && t<tl.g) typed=s.m3;
  typed=typed.replace(/\n/g,' ');
  ctx.save();ctx.beginPath();ctx.rect(35,452,279,44);ctx.clip();
  ctx.font='400 15px sans-serif';
  const typedWidth=ctx.measureText(typed).width;
  const inputX=36-Math.max(0,typedWidth-267);
  text(typed || 'メッセージを入力',inputX,474,15,typed?'#303030':'#aaaaaa');
  if (typed && t<tl.g && Math.floor(t*2)%2===0) {
    line(Math.min(310,inputX+typedWidth+2),463,Math.min(310,inputX+typedWidth+2),485,theme,1.5);
  }
  ctx.restore();
  rounded(336,458,32,32,16,t>=tl.e && t<tl.g?theme:mix(theme,'#ffffff',.55));
  text('↑',352,474,21,'#ffffff',600,'center');
  rounded(145,514,100,4,2,'#272727');
  if(s.call && t>=tl.callAt)drawIncomingCall(t,s,tl);
}
function updateLabel(s= settings()) { durationLabel.textContent=`${fmt(currentTime)} / ${fmt(timeline(s).total)}`; }
function createAudio(record=false) {
  const AudioContextClass=window.AudioContext||window.webkitAudioContext;
  if(!AudioContextClass)return null;
  let context;
  try {
    context=new AudioContextClass();
    const destination=record?context.createMediaStreamDestination():null;
    context.resume().catch(()=>{});
    return {context,target:destination||context.destination,destination};
  } catch (_) {if(context)context.close().catch(()=>{});return null;}
}
function tone(audio,startFrequency,endFrequency,duration,volume,delay=0,type='sine',attack=.006,at=null) {
  if(!audio)return;
  const {context,target}=audio,now=(at??context.currentTime)+delay;
  const oscillator=context.createOscillator(),gain=context.createGain();
  oscillator.type=type;
  oscillator.frequency.setValueAtTime(startFrequency,now);
  oscillator.frequency.exponentialRampToValueAtTime(endFrequency,now+duration);
  gain.gain.setValueAtTime(.0001,now);
  gain.gain.exponentialRampToValueAtTime(volume,now+attack);
  gain.gain.exponentialRampToValueAtTime(.0001,now+duration);
  oscillator.connect(gain);gain.connect(target);
  oscillator.start(now);oscillator.stop(now+duration+.01);
}
function keyClick(audio,at=null) {
  if(!audio)return;
  const {context,target}=audio,now=at??context.currentTime;
  if(!audio.noiseBuffer){
    const buffer=context.createBuffer(1,Math.ceil(context.sampleRate*.03),context.sampleRate);
    const samples=buffer.getChannelData(0);
    for(let i=0;i<samples.length;i++)samples[i]=Math.random()*2-1;
    audio.noiseBuffer=buffer;
  }
  const source=context.createBufferSource(),filter=context.createBiquadFilter(),gain=context.createGain();
  source.buffer=audio.noiseBuffer;
  filter.type='highpass';filter.frequency.value=2300;
  gain.gain.setValueAtTime(.0001,now);
  gain.gain.exponentialRampToValueAtTime(.028,now+.001);
  gain.gain.exponentialRampToValueAtTime(.0001,now+.026);
  source.connect(filter);filter.connect(gain);gain.connect(target);
  source.start(now);source.stop(now+.03);
  tone(audio,1150,680,.025,.009,0,'square',.006,now);
}
function playEffect(kind,audio,at=null) {
  if(kind==='receive') {
    tone(audio,680,560,.048,.055,0,'sine',.014,at);
    tone(audio,590,470,.075,.06,.055,'sine',.018,at);
  } else if(kind==='send') {
    tone(audio,390,1050,.17,.065,0,'sine',.006,at);
    tone(audio,660,1150,.09,.025,.045,'sine',.006,at);
  } else if(kind==='key') {
    keyClick(audio,at);
  } else if(kind==='ring') {
    [[784,0,.11],[988,.13,.11],[1175,.26,.11],[988,.39,.11],[784,.54,.11],[880,.69,.11],[659,.84,.2]].forEach(([frequency,delay,duration])=>{
      tone(audio,frequency,frequency,duration,.032,delay,'sine',.012,at);
      tone(audio,frequency*2,frequency*2,duration,.006,delay,'sine',.012,at);
    });
  }
}
function scheduleExportAudio(s,audio,startAt) {
  if(!audio)return;
  const tl=timeline(s);
  playEffect('receive',audio,startAt+.35);
  chars(s.m2).forEach((_,i)=>playEffect('key',audio,startAt+tl.a+i*.17));
  chars(s.m3).forEach((_,i)=>playEffect('key',audio,startAt+tl.e+i*.17));
  playEffect('send',audio,startAt+tl.g);
  if(s.m4.trim())playEffect('receive',audio,startAt+tl.h);
  if(s.m5.trim())playEffect('receive',audio,startAt+tl.followup);
  if(s.call)for(let offset=0;offset<5.2;offset+=1.35)playEffect('ring',audio,startAt+tl.callAt+offset);
}
function soundOnEvents(previous,current,s,audio) {
  if(!audio||current-previous>.5)return;
  const tl=timeline(s);
  if(previous<.35&&current>=.35)playEffect('receive',audio);
  if(previous<tl.g&&current>=tl.g)playEffect('send',audio);
  if(s.m4.trim()&&previous<tl.h&&current>=tl.h)playEffect('receive',audio);
  if(s.m5.trim()&&previous<tl.followup&&current>=tl.followup)playEffect('receive',audio);
  if(s.call)for(let offset=0;offset<5.2;offset+=1.35)if(previous<tl.callAt+offset&&current>=tl.callAt+offset)playEffect('ring',audio);
  for(const [start,value] of [[tl.a,s.m2],[tl.e,s.m3]]) {
    const countBefore=Math.max(0,Math.floor((previous-start)/.17)+1);
    const countNow=Math.min(chars(value).length,Math.max(0,Math.floor((current-start)/.17)+1));
    if(countNow>countBefore)playEffect('key',audio);
  }
}
function stop(reset=false) {
  playing=false;cancelAnimationFrame(frameId);
  if(previewAudio){previewAudio.context.close().catch(()=>{});previewAudio=null;}
  if(hasStarted)playback.hidden=false;
  if(reset){currentTime=0;draw(0,settings());updateLabel();}
}
function tick(now) {
  if (!playing) return;
  const previous=currentTime;
  currentTime=clamp((now-startTime)/1000,0,timeline(snapshot).total);
  soundOnEvents(previous,currentTime,snapshot,previewAudio);
  draw(currentTime,snapshot);updateLabel(snapshot);
  if(currentTime>=timeline(snapshot).total) { stop();return; }
  frameId=requestAnimationFrame(tick);
}
function play(restart=false) {
  if(recording||!messagesReady())return;
  if(playing)stop();
  snapshot=settings();if(restart||currentTime>=timeline(snapshot).total)currentTime=0;
  previewAudio=createAudio();
  startTime=performance.now()-currentTime*1000;playing=true;
  frameId=requestAnimationFrame(tick);
}
startButton.addEventListener('click',()=>{if(!messagesReady())return;hasStarted=true;startButton.hidden=true;play(true);});
document.getElementById('replayButton').addEventListener('click',()=>play(true));
document.getElementById('confirmButton').addEventListener('click',()=>{
  if(recording)return;
  if(!messagesReady()){
    [fields.message1,fields.message2,fields.message3].find(field=>!field.value.trim())?.focus();
    return;
  }
  document.querySelector('.preview-column').scrollIntoView({behavior:'auto',block:'start'});
  hasStarted=true;
  startButton.hidden=true;
  play(true);
});
function updateFields() {
  if(recording)return;
  if(!fields.message4.value.trim())fields.message5.value='';
  fields.message5.disabled=!fields.message4.value.trim();
  stop(true);
  document.getElementById('colorValue').textContent=fields.themeColor.value.toUpperCase();
  status.textContent=[fields.message1,fields.message2,fields.message3].some(field=>!field.value.trim())?'メッセージを設定してください':'スマホ画面を動画として保存できます';
}
for(const field of Object.values(fields)) field.addEventListener('input',updateFields);
fields.incomingCall.addEventListener('change',()=>{
  document.querySelector('.call-state').textContent=fields.incomingCall.checked?'ON':'OFF';
  updateFields();
});
document.getElementById('clearMessages').addEventListener('click',()=>{for(let i=1;i<=5;i++)fields[`message${i}`].value='';updateFields();});
document.getElementById('resetMessages').addEventListener('click',()=>{['俺のことどう思ってる？','好きだよ','教えない','じゃあ、','直接会って確かめる'].forEach((value,i)=>fields[`message${i+1}`].value=value);updateFields();});
document.getElementById('iconInput').addEventListener('change',event=>{
  const file=event.target.files?.[0];if(!file)return;
  if(!file.type.startsWith('image/')){status.textContent='画像ファイルを選んでください';return;}
  if(iconUrl)URL.revokeObjectURL(iconUrl);
  iconUrl=URL.createObjectURL(file);
  icon.onload=()=>{if(!recording)draw(currentTime,settings());};
  icon.onerror=()=>{status.textContent='画像を読み込めませんでした';};
  icon.src=iconUrl;document.getElementById('iconThumb').src=iconUrl;
  document.getElementById('clearIcon').hidden=false;
});
document.getElementById('clearIcon').addEventListener('click',()=>{
  icon.src=leafIconSrc;
  document.getElementById('iconThumb').src=leafIconSrc;
  document.getElementById('iconInput').value='';
  document.getElementById('clearIcon').hidden=true;
  if(iconUrl)URL.revokeObjectURL(iconUrl);
  iconUrl=null;
  if(!recording)stop(true);
});
const backgroundInput=document.getElementById('backgroundInput');
const backgroundThumb=document.getElementById('backgroundThumb');
const clearBackground=document.getElementById('clearBackground');
backgroundInput.addEventListener('change',event=>{
  const file=event.target.files?.[0];if(!file)return;
  if(!file.type.startsWith('image/')){status.textContent='画像ファイルを選んでください';return;}
  const nextUrl=URL.createObjectURL(file),nextImage=new Image();
  nextImage.onload=()=>{
    if(backgroundUrl)URL.revokeObjectURL(backgroundUrl);
    backgroundUrl=nextUrl;backgroundImage=nextImage;
    document.getElementById('backgroundPreview').src=nextUrl;
    backgroundThumb.hidden=false;clearBackground.hidden=false;
    if(!recording)stop(true);
  };
  nextImage.onerror=()=>{URL.revokeObjectURL(nextUrl);status.textContent='背景画像を読み込めませんでした';};
  nextImage.src=nextUrl;
});
clearBackground.addEventListener('click',()=>{
  if(backgroundUrl)URL.revokeObjectURL(backgroundUrl);
  backgroundUrl=null;backgroundImage=null;backgroundInput.value='';
  document.getElementById('backgroundPreview').removeAttribute('src');
  backgroundThumb.hidden=true;clearBackground.hidden=true;
  if(!recording)stop(true);
});
function mimeChoice(withAudio){
  const types=withAudio
    ? ['video/mp4;codecs="avc1.42E01F,mp4a.40.2"','video/mp4;codecs="avc1.424028,mp4a.40.2"','video/mp4;codecs="avc1.4D4028,mp4a.40.2"','video/webm;codecs="vp8,opus"','video/webm;codecs="vp9,opus"']
    : ['video/mp4;codecs="avc1.42E01F"','video/mp4;codecs="avc1.424028"','video/mp4;codecs="avc1.4D4028"','video/webm;codecs=vp8','video/webm;codecs=vp9'];
  return types.find(type=>MediaRecorder.isTypeSupported(type));
}
exportButton.addEventListener('click',async()=>{
  if(recording)return;
  if(!messagesReady())return;
  if(!window.MediaRecorder||!canvas.captureStream){status.textContent='このブラウザは動画の書き出しに対応していません';return;}
  stop(true);recording=true;exportButton.disabled=true;exportButton.firstElementChild.textContent='書き出し中…';
  const s=settings(),total=timeline(s).total,stream=canvas.captureStream(30),chunks=[];
  const videoTrack=stream.getVideoTracks()[0];
  let exportAudio=createAudio(true),audioEnabled=Boolean(exportAudio);
  if(exportAudio){
    status.textContent='音声を準備中…';
    const ready=await Promise.race([
      exportAudio.context.resume().then(()=>true).catch(()=>false),
      new Promise(resolve=>setTimeout(()=>resolve(false),2000))
    ]);
    if(!ready||exportAudio.context.state!=='running'){
      exportAudio.context.close().catch(()=>{});
      exportAudio=null;audioEnabled=false;
    }
  }
  if(exportAudio)stream.addTrack(exportAudio.destination.stream.getAudioTracks()[0]);
  let mime=mimeChoice(audioEnabled),recorder;
  try {
    if(!mime)throw new Error('Audio format unavailable');
    recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:4000000});
  } catch (_) {
    if(exportAudio){stream.removeTrack(exportAudio.destination.stream.getAudioTracks()[0]);exportAudio.context.close().catch(()=>{});exportAudio=null;audioEnabled=false;}
    mime=mimeChoice(false);
    try {if(!mime)throw new Error('Video format unavailable');recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:4000000});}
    catch (_){recording=false;exportButton.disabled=false;exportButton.firstElementChild.textContent='動画で書き出す';status.textContent='動画を作成できませんでした';stream.getTracks().forEach(track=>track.stop());return;}
  }
  recorder.ondataavailable=event=>{if(event.data.size)chunks.push(event.data);};
  recorder.onerror=()=>{status.textContent='書き出し中にエラーが発生しました';};
  recorder.onstop=()=>{
    stream.getTracks().forEach(track=>track.stop());
    if(exportAudio)exportAudio.context.close().catch(()=>{});
    if(chunks.length){const type=recorder.mimeType||mime,ext=type.includes('mp4')?'mp4':'webm';const url=URL.createObjectURL(new Blob(chunks,{type}));const a=document.createElement('a');a.href=url;a.download=`message-unsent.${ext}`;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);status.textContent=`動画を保存しました（${ext.toUpperCase()}${audioEnabled?'・音声付き':'・音声なし'}${ext==='webm'?'・iPhoneへの共有には非推奨':''}）`;}
    else status.textContent='動画を保存できませんでした';
    recording=false;exportButton.disabled=false;exportButton.firstElementChild.textContent='動画で書き出す';
  };
  try {recorder.start();}
  catch (_){stream.getTracks().forEach(track=>track.stop());if(exportAudio)exportAudio.context.close().catch(()=>{});recording=false;exportButton.disabled=false;exportButton.firstElementChild.textContent='動画で書き出す';status.textContent='動画を作成できませんでした';return;}
  const lead=.12;
  const start=performance.now()+lead*1000;
  if(exportAudio)scheduleExportAudio(s,exportAudio,exportAudio.context.currentTime+lead);
  let finalStarted=null,finalFrames=0;
  function render(now){
    const elapsed=Math.max(0,(now-start)/1000),t=Math.min(elapsed,total);
    currentTime=t;draw(s.call ? elapsed : t,s);updateLabel(s);status.textContent=`書き出し中… ${Math.round(t/total*100)}%`;
    if(t<total){requestAnimationFrame(render);return;}
    if(finalStarted===null)finalStarted=now;
    finalFrames++;
    if(now-finalStarted<1200||finalFrames<4){requestAnimationFrame(render);return;}
    setTimeout(()=>{
      draw(s.call ? Math.max(total,(performance.now()-start)/1000) : total,s);
      if(typeof videoTrack?.requestFrame==='function')try{videoTrack.requestFrame();}catch(_){}
      if(recorder.state!=='inactive')recorder.stop();
    },300);
  }
  requestAnimationFrame(render);
});
icon.onload=()=>draw(0,settings());
draw(0,settings());updateLabel();
