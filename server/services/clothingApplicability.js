'use strict';
function sleeveApplicable(category){const name=String(category?.name||'').toLowerCase().replace(/[_-]/g,' ');return !(/\b(jeans|trousers?|pants|skirts?|shorts|leggings|culottes|joggers|bottoms)\b/.test(name)&&!/\b(shirts?|tops?|dresses?|suits?|jackets?|kameez|hoodies?|sweaters?)\b/.test(name));}
module.exports={sleeveApplicable};
