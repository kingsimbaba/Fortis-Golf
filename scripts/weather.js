/* Fortis Golf course weather. Read-only: no changes to scoring or rounds. */
window.FortisWeather = (() => {
  const STORAGE_COURSE = 'fortisWeatherCourseId';
  const STORAGE_TIME = 'fortisWeatherTeeTime';
  const TTL = 30 * 60 * 1000;
  const cache = new Map();
  let requestId = 0;
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function coordinates(course) {
    if (!course) return null;
    const rawLat = course.latitude ?? course.lat ?? course.gps_latitude;
    const rawLng = course.longitude ?? course.lng ?? course.gps_longitude;
    if (rawLat == null || rawLng == null || String(rawLat).trim() === '' || String(rawLng).trim() === '') return null;
    const lat = Number(rawLat), lng = Number(rawLng);
    return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && (lat !== 0 || lng !== 0) ? {lat, lng} : null;
  }
  const courseName = c => c.display_name_zh || c.display_name || c.display_name_ja || c.course_name || '球場';
  const isoDate = (base, offset) => {
    const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + offset, 12);
    return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
  };
  const icon = code => {
    if ([0,1].includes(code)) return '☀️';
    if ([2].includes(code)) return '🌤️';
    if ([3].includes(code)) return '☁️';
    if ([45,48].includes(code)) return '🌫️';
    if ([51,53,55,56,57].includes(code)) return '🌦️';
    if ([61,63,65,66,67,80,81,82].includes(code)) return '🌧️';
    if ([71,73,75,77,85,86].includes(code)) return '🌨️';
    if ([95,96,99].includes(code)) return '⛈️';
    return '🌤️';
  };
  const description = code => {
    if ([0,1].includes(code)) return '晴朗';
    if (code === 2) return '局部多雲';
    if (code === 3) return '陰天';
    if ([45,48].includes(code)) return '有霧';
    if ([95,96,99].includes(code)) return '雷雨';
    if ([71,73,75,77,85,86].includes(code)) return '降雪';
    if ([51,53,55,56,57,61,63,65,66,67,80,81,82].includes(code)) return '降雨';
    return '天氣預報';
  };
  const round = value => value != null && value !== '' && Number.isFinite(Number(value)) ? Math.round(Number(value)) : '—';
  function mount({courses = []} = {}) {
    const host = document.getElementById('fortisHomeWeather');
    if (!host) return;
    const all = courses.filter(c => c && c.id != null).slice().sort((a,b) => courseName(a).localeCompare(courseName(b),'zh-Hant'));
    if (!all.length) { host.innerHTML = ''; return; }
    const remembered = localStorage.getItem(STORAGE_COURSE);
    const chosen = all.find(c=>String(c.id)===remembered) || all.find(c=>coordinates(c)) || all[0];
    const time = localStorage.getItem(STORAGE_TIME) || '08:00';
    host.innerHTML = '<section class="fg-weather card" aria-label="球場天氣預報">'+
      '<div class="fg-weather-header"><div><span class="fg-weather-eyebrow">FORTIS GOLF · COURSE WEATHER</span><h2>⛳ 球場天氣預報</h2></div><span class="fg-weather-live">GPS 球場定位</span></div>'+
      '<div class="fg-weather-controls"><label>選擇球場<select id="fgWeatherCourse">'+all.map(c=>'<option value="'+escapeHtml(c.id)+'"'+(c===chosen?' selected':'')+'>'+escapeHtml(courseName(c))+(c.course_name && courseName(c)!==c.course_name?' · '+escapeHtml(c.course_name):'')+'</option>').join('')+'</select></label>'+
      '<label>預計開球時間<select id="fgWeatherTime">'+Array.from({length:15},(_,i)=>{const h=String(i+5).padStart(2,'0')+':00';return '<option value="'+h+'"'+(h===time?' selected':'')+'>'+h+'</option>'}).join('')+'</select></label></div>'+
      '<div class="fg-weather-days" role="group" aria-label="預報日期">'+[['today','今天'],['tomorrow','明天'],['after','後天'],['week','7 天預報']].map(([v,l])=>'<button type="button" data-day="'+v+'" class="fg-weather-day'+(v==='tomorrow'?' selected':'')+'">'+l+'</button>').join('')+'</div>'+
      '<div id="fgWeatherResult" class="fg-weather-result" aria-live="polite">讀取球場氣象中…</div>'+
      '<div class="fg-weather-footer"><span id="fgWeatherUpdated">預報來源：Open-Meteo</span><button type="button" id="fgWeatherRefresh" aria-label="重新整理天氣">↻ 更新</button></div></section>';
    const select = host.querySelector('#fgWeatherCourse');
    const timeSelect = host.querySelector('#fgWeatherTime');
    const result = host.querySelector('#fgWeatherResult');
    let day = 'tomorrow';
    const localLabel = date => { const [y,m,d]=date.split('-').map(Number);return m+'/'+d; };
    const stamp = ts => ts ? new Intl.DateTimeFormat('zh-TW',{hour:'2-digit',minute:'2-digit'}).format(new Date(ts)) : '';
    function status(message) { result.innerHTML = '<p class="fg-weather-status">'+escapeHtml(message)+'</p>'; }
    function show(data) {
      const selected = all.find(c=>String(c.id)===select.value);
      if (!selected) return;
      const daily = data.daily || {}, hourly = data.hourly || {};
      const dates = daily.time || [];
      const nowDate = data.current?.time?.slice(0,10) || new Intl.DateTimeFormat('sv-SE',{timeZone:data.timezone || 'UTC',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
      const first = Math.max(0,dates.indexOf(nowDate));
      const offset = day==='today'?0:day==='tomorrow'?1:day==='after'?2:0;
      const index = Math.min(first+offset,dates.length-1);
      const fmt = (v,unit) => v == null || !Number.isFinite(Number(v)) ? '—' : round(v)+unit;
      const alert = (precip,wind,gust,code) => {
        if ([95,96,99].includes(+code)) return '⚠️ 預報有雷雨；打雷時請停止打球並前往安全建築物。';
        if (+precip>=70 || +gust>=50) return '⚠️ 降雨或陣風可能影響打球，請留意球場公告。';
        if (+precip>=40 || +wind>=25) return '☂️ 建議攜帶雨具，並留意風勢變化。';
        return '✓ 天氣條件看來適合打球，出發前再確認最新預報。';
      };
      if (day==='week') {
        result.innerHTML='<div class="fg-weather-week">'+dates.slice(first,first+7).map((date,i)=>{
          const j=first+i, tempMin=daily.temperature_2m_min?.[j],tempMax=daily.temperature_2m_max?.[j];
          return '<div class="fg-weather-weekday"><b>'+escapeHtml(localLabel(date))+'</b><span class="fg-weather-emoji">'+icon(daily.weather_code?.[j])+'</span><strong>'+fmt(tempMin,'°')+' / '+fmt(tempMax,'°')+'</strong><small>☂ '+fmt(daily.precipitation_probability_max?.[j],'%')+'</small></div>';
        }).join('')+'</div><p class="fg-weather-note">每日預報僅供規劃，降雨機率不代表一定下雨。</p>';
      } else {
        const date = dates[index];
        if (!date) {status('暫無該日期的預報。');return;}
        const teeHour = timeSelect.value.slice(0,2);
        const hours = hourly.time || [];
        let selectedIndex = hours.findIndex(t=>t===date+'T'+teeHour+':00');
        if (selectedIndex<0) {
          let closest=Infinity;
          hours.forEach((t,i)=>{if(t.slice(0,10)!==date)return;const diff=Math.abs(Number(t.slice(11,13))-Number(teeHour));if(diff<closest){closest=diff;selectedIndex=i;}});
        }
        if (selectedIndex<0) {status('選定時間暫無逐時預報。');return;}
        const weather = hourly.weather_code?.[selectedIndex];
        const temp = hourly.temperature_2m?.[selectedIndex];
        const rain = hourly.precipitation_probability?.[selectedIndex];
        const wind = hourly.wind_speed_10m?.[selectedIndex];
        const gust = hourly.wind_gusts_10m?.[selectedIndex];
        const bearing = hourly.wind_direction_10m?.[selectedIndex];
        const direction = Number.isFinite(+bearing)?['北','東北','東','東南','南','西南','西','西北'][Math.round(+bearing/45)%8]+'風':'—';
        const next = Array.from({length:5},(_,i)=>selectedIndex+i).filter(i=>hours[i] && hours[i].slice(0,10)===date);
        const metFallback=data.source==='MET Norway';
        const precipLabel=metFallback && rain==null ? '降雨量' : '降雨機率';
        const precipValue=metFallback && rain==null ? fmt(hourly.precipitation_amount?.[selectedIndex],' mm') : fmt(rain,'%');
        result.innerHTML='<div class="fg-weather-main"><div><span class="fg-weather-sub">'+escapeHtml(date)+' · '+escapeHtml(hours[selectedIndex].slice(11,16))+(hours[selectedIndex].slice(11,16)!==timeSelect.value?'（最近預報時間）':'')+' 開球參考</span><div class="fg-weather-temp"><span>'+icon(weather)+'</span><strong>'+fmt(temp,'°C')+'</strong></div><div class="fg-weather-description">'+description(weather)+'</div></div><div class="fg-weather-metrics"><div>☂ '+precipLabel+' <b>'+precipValue+'</b></div><div>➤ 風速 <b>'+fmt(wind,' km/h')+'</b></div><div>↗ 陣風 <b>'+fmt(gust,' km/h')+'</b></div><div>🧭 風向 <b>'+direction+'</b></div></div></div>'+
          '<div class="fg-weather-hours">'+next.map(i=>'<div><small>'+escapeHtml(hours[i].slice(11,16))+'</small><span>'+icon(hourly.weather_code?.[i])+'</span><b>'+fmt(hourly.temperature_2m?.[i],'°')+'</b><small>☂ '+(metFallback && hourly.precipitation_probability?.[i]==null ? fmt(hourly.precipitation_amount?.[i],' mm') : fmt(hourly.precipitation_probability?.[i],'%'))+'</small></div>').join('')+'</div>'+
          '<div class="fg-weather-tip">'+alert(rain,wind,gust,weather)+'</div>';
      }
      host.querySelector('#fgWeatherUpdated').textContent = (data.source||'Open-Meteo')+' · 球場當地時間 '+(data.timezone_abbreviation||'')+' · 約每 30 分鐘更新';
    }
    async function load(force = false) {
      const course=all.find(c=>String(c.id)===select.value),coords=coordinates(course);
      if (!coords) {status('此球場尚未設定 GPS 座標。請由管理員在球場管理中補上經緯度。');return;}
      const key=coords.lat.toFixed(5)+','+coords.lng.toFixed(5);
      const run=++requestId;
      const cached=cache.get(key);
      if (!force && cached && Date.now()-cached.time<TTL) {show(cached.data);return;}
      status('正在讀取 '+courseName(course)+' 的天氣預報…');
      const controller=new AbortController();
      const timer=setTimeout(()=>controller.abort(),17000);
      try {
        const response=await fetch('/api/weather?lat='+encodeURIComponent(coords.lat)+'&lng='+encodeURIComponent(coords.lng),{signal:controller.signal});
        if (!response.ok) throw new Error('HTTP '+response.status);
        const data=await response.json();
        if (!data.hourly?.time?.length || !data.daily?.time?.length) throw new Error('Missing forecast');
        cache.set(key,{time:Date.now(),data});
        if (run===requestId && host.isConnected) show(data);
      } catch (err) {
        if (run===requestId && host.isConnected) {
          if (cached) {show(cached.data);host.querySelector('#fgWeatherUpdated').textContent='無法更新，顯示上次取得的預報';}
          else status('氣象服務暫時無法連線，請點「更新」重試。若持續失敗，請確認球場 GPS 座標。');
        }
      } finally {clearTimeout(timer);}
    }
    select.addEventListener('change',()=>{localStorage.setItem(STORAGE_COURSE,select.value);load();});
    timeSelect.addEventListener('change',()=>{localStorage.setItem(STORAGE_TIME,timeSelect.value);load();});
    host.querySelectorAll('[data-day]').forEach(button=>button.addEventListener('click',()=>{
      day=button.dataset.day;
      host.querySelectorAll('[data-day]').forEach(b=>b.classList.toggle('selected',b===button));
      load();
    }));
    host.querySelector('#fgWeatherRefresh').addEventListener('click',()=>load(true));
    load();
  }
  return {mount,coordinates};
})();
