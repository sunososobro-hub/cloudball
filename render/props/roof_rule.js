/* #323: pure rule, plain Node can import it (roof.js cannot: it needs three). A park whose shape says roof:false shows no roof on max. */
export const roofOn=P=>!(P&&P.shape&&P.shape.roof===false);
