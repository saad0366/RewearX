'use strict';
// Ordered vocabularies mirror feature_extraction/clothing_config.py. Never DB IDs.
const taxonomy = {
  color: ['black','white','grey','blue','green','red','pink','purple','brown','beige','yellow','gold'],
  occasion: ['casual','formal','party','wedding','sports'],
  season: ['summer','winter','all_season'],
  category: ['t_shirt','shirt','hoodie','sweater','jacket','jeans','trousers','dress','skirt','shalwar_kameez','lehenga','other_fashion'],
  sleeve_length: ['sleeveless','short','half','three_quarter','full'],
  pattern: ['plain','striped','checked','floral','printed','embroidered'],
};
module.exports = Object.freeze(Object.fromEntries(Object.entries(taxonomy).map(([k,v]) => [k,Object.freeze(v)])));
