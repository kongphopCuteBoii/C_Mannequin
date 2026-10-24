/* Compact bilingual welcome window. Kept independent from the 3D app. */
export function initWelcome($){

const WELCOME_COPY={
  en:"Thanks for using my website! I'm CuteBoii, and this website is meant to be my personal mannequin. By a broke man, for all the broke people. I will continuously implement premium & convenient features (those usually behind the paywall) in my spare time, so don't judge it by its current state! Enjoy!",
  th:"ขอบคุณที่เลือกใช้เว็บไซต์ผมนะครับ !! ผม CuteBoii และเว็บนี้ผมสร้างขึ้นมาเพื่อสนอง need ตัวเองครับ ด้วยความที่แอพจำพวกหุ่นจำลองที่ใช้ง่ายๆ พวกนี้ส่วนใหญ่คิดราคากันโหดมาก ผมเลยสร้างเว็บนี้มา ใส่ features ที่มักจะเสียเงินเพื่อใช้เอง อาจจะใช้ยากหน่อยแต่พอไปวัดไปวาได้ ผมจะมาอัพเดทเว็บนี้บ่อยๆ จะพัฒนาไปเรื่อยๆ ครับ !!"
};
function updateWelcomeCopy(l){
  const th=l==='th';
  $('#welcomeTitle').textContent=th?"CuteBoii's Mannequin":"CuteBoii's Mannequin";
  $('#welcomeMessage').textContent=WELCOME_COPY[th?'th':'en'];
  $('#welcomeDontLabel').textContent=th?'ไม่ต้องแสดงอีก':"Don't show again";
  $('#welcomeOk').textContent=th?'เข้าใจแล้ว':'Got it';
  $('#welcomeClose').setAttribute('aria-label',th?'ปิด':'Close');
}
function closeWelcome(){
  if($('#welcomeDontShow').checked){try{localStorage.setItem('cb-welcome-dismissed','1')}catch(e){}}
  $('#welcomeWin').hidden=true;
}
$('#welcomeClose').addEventListener('click',closeWelcome);
$('#welcomeOk').addEventListener('click',closeWelcome);
try{if(localStorage.getItem('cb-welcome-dismissed')!=='1')$('#welcomeWin').hidden=false}catch(e){$('#welcomeWin').hidden=false}

  return updateWelcomeCopy;
}
