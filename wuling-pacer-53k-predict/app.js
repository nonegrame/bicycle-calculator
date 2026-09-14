const $=id=>document.getElementById(id);
const clamp=(n,a,b)=>Math.min(b,Math.max(a,n));
const inputs=["hours","minutes","ftp","weight","bike","weeks","volume","climb","load","intensity"];

function calculate(){
  const v=Object.fromEntries(inputs.map(k=>[k,Number($(k).value)]));
  const goal=v.hours*60+v.minutes;
  const totalMass=v.weight+v.bike;
  // 西進約 53 km / 2,800 m。以可持續功率、體重與耐力代理值建立保守預測；高海拔已反映在所需功率。
  const baseNeed=148+(240-goal)*.42+(totalMass-70)*2.05;
  const targetNP=Math.round(baseNeed);
  const neededFtp=Math.round(targetNP/.76);
  const powerMargin=(v.ftp-neededFtp)/neededFtp;
  const endurance=clamp((v.climb/240)*62+(v.volume/600)*38,0,100);
  const consistency=clamp((v.volume/500)*55+(v.load/420)*35+(v.weeks/24)*10,0,100);
  const intensityFit=clamp(100-Math.abs(v.intensity-13)*4.2,25,100);
  const raw=50+powerMargin*150+(endurance-60)*.25+(consistency-60)*.18+(intensityFit-70)*.08;
  const prob=Math.round(clamp(raw,5,95));
  const currentNP=v.ftp*.76*(.78+.22*endurance/100);
  const ratio=targetNP/currentNP;
  const midpoint=goal*Math.pow(ratio,.82);
  const spread=12+Math.round((100-consistency)/9);
  const format=m=>`${Math.floor(m/60)}:${String(Math.round(m%60)).padStart(2,"0")}`;
  $("probability").textContent=prob;
  $("gaugePath").style.strokeDasharray=`${prob} 100`;
  $("estimate").textContent=`${format(midpoint-spread/2)}–${format(midpoint+spread/2)}`;
  $("targetPower").textContent=`${targetNP} W`;
  $("neededFtp").textContent=`${neededFtp} W`;
  $("confidence").textContent=consistency>72?"較高信心":consistency>48?"中等信心":"低信心";
  $("scoreLabel").textContent=prob>=75?"準備度良好":prob>=50?"有機會，但還不穩":"目前差距明顯";
  setFactor("endurance",endurance,endurance>75?"良好":endurance>50?"可再加強":"主要缺口");
  setFactor("power",clamp(50+powerMargin*250,5,100),powerMargin>.05?"有餘裕":powerMargin>-.06?"接近門檻":"仍有差距");
  setFactor("consistency",consistency,consistency>75?"良好":consistency>50?"普通":"不足");
  let comment;
  if(prob>=75) comment=`以目前資料，${v.hours} 小時 ${v.minutes} 分是合理但仍需執行力的目標。接下來優先保留每週一次 3–4 小時爬坡耐力，並在疲勞時維持穩定輸出；不必為了提高機率硬塞更多高強度。`;
  else if(powerMargin<-.06) comment=`最大限制是功率餘裕。目標約需要 ${targetNP} W 的長時間標準化功率，推算 FTP 約 ${neededFtp} W。先把 LT2 與長爬坡耐力拉近門檻，比單純堆短時間強度更直接。`;
  else comment=`你已接近門檻，但長時間耐力仍讓預測區間偏寬。建議逐步把最長連續爬坡拉到 180–240 分鐘，並練習在後半程守住 72–78% FTP；每 4 週用新資料重算一次。`;
  $("comment").textContent=comment;
  return {probability:prob,estimatedFinish:$("estimate").textContent,targetPower,neededFtp};
}
function setFactor(id,value,text){$(id+"Bar").style.width=`${Math.round(value)}%`;$(id+"Text").textContent=text}
$("predictForm").addEventListener("submit",e=>{e.preventDefault();calculate()});
inputs.forEach(id=>$(id).addEventListener("change",calculate));
const dialog=$("sourceDialog");let selectedSource="coros";
$("sourceBtn").onclick=()=>dialog.showModal();dialog.querySelector(".close").onclick=()=>dialog.close();
const sourceData={
  coros:{name:"COROS",desc:"COROS MCP 尚未串接，目前使用示範資料測試預測模型。",items:["活動與分圈（規劃中）","功率與心率（規劃中）","訓練負荷（規劃中）","FIT 詳細資料（規劃中）"],demo:[468,172,365,12]},
  garmin:{name:"Fitness AI Connector",desc:"資料來源整合功能測試中，目前使用示範資料測試預測模型。",items:["活動與分圈（規劃中）","功率與心率區間（規劃中）","HRV 與睡眠（規劃中）","週間趨勢（規劃中）"],demo:[446,165,352,13]}
};
document.querySelectorAll(".source-option").forEach(btn=>btn.onclick=()=>{
  selectedSource=btn.dataset.source;const data=sourceData[selectedSource];
  document.querySelectorAll(".source-option").forEach(x=>{x.classList.toggle("active",x===btn);x.setAttribute("aria-checked",x===btn)});
  $("sourceDescription").textContent=data.desc;$("syncList").innerHTML=data.items.map(x=>`<span>${x}</span>`).join("");
  $("demoSync").textContent=`載入 ${data.name} 示範摘要`;$("sourceHint").textContent=`功能測試中；${data.name} 尚未串接，目前僅提供示範摘要。`;
});
$("demoSync").onclick=()=>{const data=sourceData[selectedSource];["volume","climb","load","intensity"].forEach((id,i)=>$(id).value=data.demo[i]);$("sourceName").textContent=data.name;$("sourceState").textContent="測試中｜示範資料";dialog.close();calculate()};
calculate();
if(document.modelContext?.registerTool){document.modelContext.registerTool({name:"predict_wuling_goal",title:"預測西進武嶺目標",description:"設定目標時間與訓練指標，更新頁面上的達標機率。",inputSchema:{type:"object",properties:{hours:{type:"number",minimum:2,maximum:8},minutes:{type:"number",minimum:0,maximum:59}},required:["hours","minutes"],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},execute:({hours,minutes})=>{$("hours").value=hours;$("minutes").value=minutes;return calculate()}})}
