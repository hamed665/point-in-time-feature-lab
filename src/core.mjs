import {requireValue,record,identifier,boundedArray,timestamp,finite} from './validation.mjs';

export function joinFeatures(events, queries, maxAgeSeconds=null) {
  boundedArray(events,'events'); boundedArray(queries,'queries',1000);
  requireValue(maxAgeSeconds===null || (finite(maxAgeSeconds)&&maxAgeSeconds>=0),'invalid maximum age');
  const identities=new Set();
  const indexed=new Map();
  for (const event of events) {
    requireValue(record(event)&&identifier(event.entity)&&record(event.values),'invalid feature event');
    const eventAt=timestamp(event.event_at), availableAt=timestamp(event.available_at);
    requireValue(availableAt>=eventAt,'feature cannot be available before it occurred');
    const key=JSON.stringify([event.entity,eventAt,availableAt]);
    requireValue(!identities.has(key),'ambiguous duplicate feature event'); identities.add(key);
    requireValue(Object.keys(event.values).length>0 && Object.keys(event.values).length<=100,'1–100 features per event required');
    for(const [name,value] of Object.entries(event.values)) {
      requireValue(identifier(name) && (value===null||typeof value==='string'||typeof value==='boolean'||finite(value)),'scalar feature values required');
    }
    const group=indexed.get(event.entity)||[];
    group.push({...event,eventAt,availableAt}); indexed.set(event.entity,group);
  }
  for(const group of indexed.values()) group.sort((a,b)=>a.eventAt-b.eventAt||a.availableAt-b.availableAt);
  return queries.map(query=>{
    requireValue(record(query)&&identifier(query.entity),'invalid query');
    const at=timestamp(query.at), features=new Map();
    let unavailable=0,expired=0;
    for(const event of indexed.get(query.entity)||[]) {
      if(event.eventAt>at) continue;
      if(event.availableAt>at) { unavailable++; continue; }
      if(maxAgeSeconds!==null && at-event.eventAt>maxAgeSeconds*1000) {expired++;continue;}
      for(const [name,value] of Object.entries(event.values)) features.set(name,{
        value,event_at:event.event_at,available_at:event.available_at,
        age_seconds:(at-event.eventAt)/1000
      });
    }
    return {entity:query.entity,at:query.at,features:Object.fromEntries(features),unavailable,expired};
  });
}

export function analyze(input) {
  requireValue(record(input),'object input required');
  const joins=joinFeatures(input.events,input.queries,input.max_age_seconds??null);
  const rows=joins.flatMap(j=>Object.entries(j.features).map(([name,f])=>({entity:j.entity,prediction_time:j.at,feature:name,value:f.value,event_time:f.event_at,available_time:f.available_at,age_seconds:f.age_seconds})));
  const blocked=joins.reduce((n,j)=>n+j.unavailable,0);
  return {summary:[{label:'Prediction rows',value:joins.length},{label:'Feature values',value:rows.length},{label:'Unavailable events excluded',value:blocked}],
    note:'Eligibility uses both event time and availability time. Counts are per prediction query.',
    columns:['entity','prediction_time','feature','value','event_time','available_time','age_seconds'],rows,joins};
}
