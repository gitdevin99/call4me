export function insideBounds(point,bounds){
 if(!point||!bounds?.low||!bounds?.high)return false;
 const {latitude,longitude}=point,{low,high}=bounds;
 return latitude>=low.latitude&&latitude<=high.latitude&&(low.longitude<=high.longitude?longitude>=low.longitude&&longitude<=high.longitude:longitude>=low.longitude||longitude<=high.longitude);
}
