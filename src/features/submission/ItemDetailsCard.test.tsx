import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import type { ItemDescriptor } from '../../api';
import { ItemDetailsCard } from './ItemDetailsCard';
afterEach(cleanup);
const descriptor: ItemDescriptor = {
 contractVersion:1, code:'D',status:'APPROVED',stage:'REVIEWED',
 identity:{name:'Reviewed device',description:'Verified description',brand:'Brand',model:null},
 classification:{family:{code:'ELECTRONICS',name:{en:'Electronics'}},category:{code:'PHONE',name:{en:'Phone'}},itemType:{code:'SMARTPHONE',name:{en:'Smartphone'}}},
 physical:{quantity:1,size:{value:'SMALL',basis:'OPERATOR_VERIFIED'},weight:{value:null,unit:'KG',basis:'UNKNOWN'},weightEstimate:{min:.1,max:.3,unit:'KG',basis:'INFERRED'},dimensionsEstimate:null},
 materials:[{ref:{module:'wasteMaterial',schema:'wasteMaterialType',code:'CIRCUIT_BOARD'},name:{en:'Circuit board'},kind:'COMPONENT',basis:'INFERRED',confidence:.8}],
 condition:{value:'UNKNOWN',basis:'UNKNOWN'},
 environment:{assessment:null,provisional:false,observations:{recyclability:{value:'POTENTIAL',basis:'INFERRED'},contamination:{value:'UNKNOWN',basis:'UNKNOWN'},recoveryPotential:{value:'POTENTIAL',basis:'INFERRED'},hazards:[{code:'BATTERY',basis:'INFERRED'}]}},
 review:{decision:'APPROVED',comment:'Accepted after inspection',reviewedAt:'2026-09-10'},
};
it.each(['SUGGESTED','SUBMITTED','REVIEWED'])('keeps full descriptor details available at the %s stage',stage=>{
 render(<ItemDetailsCard record={{code:'D',descriptor:{...descriptor,stage},submittedFacts:{name:'Old device'},metadata:{}}}/>);
 expect(screen.getByRole('heading',{name:'Reviewed device'})).toBeInTheDocument();
 expect(screen.queryByText('Old device')).not.toBeInTheDocument();
 expect(screen.getByText('Circuit board')).toBeInTheDocument();
 expect(screen.getByText('0.1–0.3 kg · inferred')).toBeInTheDocument();
 expect(screen.getByText('Accepted after inspection')).toBeInTheDocument();
 expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
});
it('shows exact rejection feedback and exposes only the identity edit action',()=>{
 render(<ItemDetailsCard record={{code:'D',descriptor:{...descriptor,review:{...descriptor.review,decision:'REJECTED',comment:'Battery casing is damaged.'}},metadata:{}}} onEdit={()=>{}}/>);
 expect(screen.getByText('Battery casing is damaged.')).toBeInTheDocument();
 expect(screen.getByRole('button',{name:'Edit name and description'})).toBeInTheDocument();
 expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
});

it('keeps the manual evidence warning visible for submissions and approved assets',()=>{
 const evidenceReview={manualApprovalRequired:true,manualApprovalRecorded:false,label:'Manual approval required',message:'The collection team must inspect this item.',reason:'Promotional layout',sourceLabel:'Promotional graphic'};
 render(<ItemDetailsCard record={{code:'D',descriptor:{...descriptor,evidenceReview},metadata:{}}}/>);
 expect(screen.getByRole('note')).toHaveTextContent('Manual approval required');
 expect(screen.getByRole('note')).toHaveTextContent('Promotional graphic');
 expect(screen.getByRole('note')).toHaveTextContent('The collection team must inspect this item.');
});
