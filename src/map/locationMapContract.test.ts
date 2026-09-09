import { describe, expect, it } from 'vitest';
import { categoryForFeature, parseMapInteraction, parseMapPresentation, shouldHandleMapWheel } from './locationMapContract';

const presentation = {defaultCategoryCode:'dropoff', categories:[
  {code:'reuse',label:'Reusable devices',color:'#123456',matchTerms:['refurbish']},
  {code:'dropoff',label:'Drop-off',color:'#abcdef',matchTerms:[]}
]};
const interaction = {wheelZoomMode:'MODIFIER' as const,wheelStep:1,wheelCooldownMs:180,zoomAnimationSeconds:0.42};
describe('Location shared rendering contract', () => {
  it('uses backend category labels, colors, priority and default', () => {
    const parsed = parseMapPresentation(presentation);
    expect(categoryForFeature({serviceCapabilities:['REFURBISH']},parsed)?.code).toBe('reuse');
    expect(categoryForFeature({name:'General centre'},parsed)?.label).toBe('Drop-off');
    expect(categoryForFeature({name:'Refurbish desk'},parsed)?.color).toBe('#123456');
    expect(categoryForFeature({name:'General centre'})).toBeUndefined();
  });
  it('rejects invalid or ambiguous presentation and out-of-bounds interaction', () => {
    expect(parseMapPresentation({...presentation,categories:[...presentation.categories,presentation.categories[0]]})).toBeUndefined();
    expect(parseMapPresentation({...presentation,defaultCategoryCode:'missing'})).toBeUndefined();
    expect(parseMapPresentation({...presentation,categories:[{...presentation.categories[0],color:'url(javascript:0)'}]})).toBeUndefined();
    expect(parseMapInteraction({...interaction,wheelStep:100})).toBeUndefined();
    expect(parseMapInteraction({...interaction,wheelCooldownMs:-1})).toBeUndefined();
  });
  it('handles the first modifier event without capturing ordinary scroll', () => {
    const wheel = {deltaY:-1,metaKey:false,ctrlKey:false};
    expect(shouldHandleMapWheel(wheel,interaction,'MacIntel')).toBe(false);
    expect(shouldHandleMapWheel({...wheel,metaKey:true},interaction,'MacIntel')).toBe(true);
    expect(shouldHandleMapWheel({...wheel,ctrlKey:true},interaction,'MacIntel')).toBe(false);
    expect(shouldHandleMapWheel({...wheel,ctrlKey:true},interaction,'Win32')).toBe(true);
    expect(shouldHandleMapWheel(wheel,{...interaction,wheelZoomMode:'FREE'},'MacIntel')).toBe(true);
    expect(shouldHandleMapWheel({...wheel,metaKey:true},{...interaction,wheelZoomMode:'DISABLED'},'MacIntel')).toBe(false);
  });
});
