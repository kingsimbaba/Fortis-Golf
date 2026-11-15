/* Fortis Golf weather proxy with an independent backup provider.
 * Weather is read-only and never changes scores or rounds.
 */
const providers = ['Open-Meteo', 'MET Norway'];
const cache = new Map();
const CACHE_MS = 30 * 60 * 1000;
const pad = n => String(n).padStart(2,'0');
const timeoutFetch = async (url, options={}) => {
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),6500);
  try {
    const response=await fetch(url,{...options,signal:controller.signal});
    if (!response.ok) throw new Error('HTTP '+response.status);
    return await response.json();
  } finally {clearTimeout(timer);}
};
const numeric = n => typeof n === 'number' && Number.isFinite(n) ? n : null;
function dayTime(iso, timeZone) {
  const parts=new Intl.DateTimeFormat('en-US',{timeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'}).formatToParts(new Date(iso));
  const pick=t=>parts.find(x=>x.type===t)?.value || '00';
  return pick('year')+'-'+pick('month')+'-'+pick('day')+'T'+pick('hour')+':00';
}
function metCode(symbol='') {
  if (symbol.includes('thunder')) return 95;
  if (symbol.includes('snow') || symbol.includes('sleet')) return 71;
  if (symbol.includes('rain') || symbol.includes('showers')) return 61;
  if (symbol.includes('fog')) return 45;
  if (symbol.includes('cloudy')) return symbol.includes('partly')?2:3;
  if (symbol.includes('fair')) return 1;
  if (symbol.includes('clear')) return 0;
  return 2;
}
function zoneAt(lat,lng) {
  // Use Intl's location-independent fallback only when original API is unreachable.
  // Official timezone lookup requires a separate provider; use a small regional set.
  if (lat>=20 && lat<=27 && lng>=118 && lng<=123) return 'Asia/Taipei';
  if (lat>=30 && lat<=46 && lng>=129 && lng<=146) return 'Asia/Tokyo';
  if (lat>=8 && lat<=24 && lng>=100 && lng<=110) return 'Asia/Ho_Chi_Minh';
  if (lat>=5 && lat<=21 && lng>=97 && lng<=106) return 'Asia/Bangkok';
  if (lat>=18 && lat<=54 && lng>=73 && lng<=135) return 'Asia/Shanghai';
  if (lat>=32 && lat<=49 && lng>=-125 && lng<=-114) return 'America/Los_Angeles';
  return 'UTC';
}
function normalizeMet(data, lat, lng) {
  const zone=zoneAt(lat,lng);
  const series=data?.properties?.timeseries;
  if (!Array.isArray(series)||!series.length) throw new Error('MET missing forecast');
  const byHour=new Map();
  for (const item of series) {
    const time=dayTime(item.time,zone);
    const instant=item.data?.instant?.details || {};
    const next=item.data?.next_1_hours || item.data?.next_6_hours || item.data?.next_12_hours || {};
    const d=next.details || {};
    const symbol=next.summary?.symbol_code || '';
    byHour.set(time,{
      time,temp:numeric(instant.air_temperature),
      wind:numeric(instant.wind_speed)===null?null:instant.wind_speed*3.6,
      gust:numeric(instant.wind_speed_of_gust)===null?null:instant.wind_speed_of_gust*3.6,
      direction:numeric(instant.wind_from_direction),
      precip:numeric(d.probability_of_precipitation),
      rainAmount:numeric(d.precipitation_amount),
      code:metCode(symbol)
    });
  }
  const list=Array.from(byHour.values()).sort((a,b)=>a.time.localeCompare(b.time));
  const allDays=Array.from(new Set(list.map(h=>h.time.slice(0,10))));
  const daily={
    time:allDays,weather_code:[],temperature_2m_max:[],temperature_2m_min:[],
    precipitation_probability_max:[]
  };
  for (const day of allDays) {
    const hours=list.filter(h=>h.time.startsWith(day));
    const temps=hours.map(h=>h.temp).filter(v=>v!=null);
    const rain=hours.map(h=>h.precip).filter(v=>v!=null);
    daily.weather_code.push(hours.some(h=>h.code===95)?95:hours.some(h=>h.code>=61)?61:hours[Math.floor(hours.length/2)]?.code??2);
    daily.temperature_2m_max.push(temps.length?Math.max(...temps):null);
    daily.temperature_2m_min.push(temps.length?Math.min(...temps):null);
    daily.precipitation_probability_max.push(rain.length?Math.max(...rain):null);
  }
  return {
    source:'MET Norway',
    timezone:zone,
    timezone_abbreviation:zone,
    current:{time:list[0]?.time},
    hourly:{
      time:list.map(h=>h.time),temperature_2m:list.map(h=>h.temp),
      precipitation_probability:list.map(h=>h.precip),
      precipitation_amount:list.map(h=>h.rainAmount),
      weather_code:list.map(h=>h.code),
      wind_speed_10m:list.map(h=>h.wind),
      wind_gusts_10m:list.map(h=>h.gust),
      wind_direction_10m:list.map(h=>h.direction)
    },daily
  };
}
async function openMeteo(lat,lng) {
  const params=new URLSearchParams({
    latitude:String(lat),longitude:String(lng),timezone:'auto',forecast_days:'8',
    temperature_unit:'celsius',wind_speed_unit:'kmh',current:'temperature_2m',
    hourly:'temperature_2m,precipitation_probability,weather_code,wind_speed_10m,wind_gusts_10m,wind_direction_10m',
    daily:'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max'
  });
  const data=await timeoutFetch('https://api.open-meteo.com/v1/forecast?'+params);
  if (!data?.hourly?.time?.length || !data?.daily?.time?.length) throw new Error('Open-Meteo empty');
  return {...data,source:'Open-Meteo'};
}
async function metNorway(lat,lng) {
  const url='https://api.met.no/weatherapi/locationforecast/2.0/compact?lat='+lat.toFixed(4)+'&lon='+lng.toFixed(4);
  const data=await timeoutFetch(url,{headers:{'User-Agent':'FortisGolfWeather/1.0 (https://fortis-golf.vercel.app)','Accept':'application/json'}});
  return normalizeMet(data,lat,lng);
}
export default async function handler(req,res) {
  if (req.method!=='GET') return res.status(405).json({error:'Method not allowed'});
  const lat=Number(req.query.lat),lng=Number(req.query.lng);
  if (!Number.isFinite(lat)||!Number.isFinite(lng)||Math.abs(lat)>90||Math.abs(lng)>180||(lat===0&&lng===0))
    return res.status(400).json({error:'Invalid course coordinates'});
  const key=lat.toFixed(4)+','+lng.toFixed(4);
  const entry=cache.get(key);
  if(entry && Date.now()-entry.time<CACHE_MS) {
    res.setHeader('Cache-Control','public, s-maxage=1800, stale-while-revalidate=3600');
    return res.status(200).json(entry.data);
  }
  let data, error;
  try { data=await openMeteo(lat,lng); }
  catch(e) {error=e;try {data=await metNorway(lat,lng);}catch(backupErr){error=backupErr;}}
  if(!data) {
    if(entry) return res.status(200).json({...entry.data,stale:true});
    return res.status(503).json({error:'Weather services temporarily unavailable',detail:String(error?.message||'Unknown')});
  }
  cache.set(key,{time:Date.now(),data});
  if(cache.size>100) cache.delete(cache.keys().next().value);
  res.setHeader('Cache-Control','public, s-maxage=1800, stale-while-revalidate=3600');
  return res.status(200).json(data);
}
