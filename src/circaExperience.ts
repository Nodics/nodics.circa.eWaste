export type AssetStatus = 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED' | 'LISTED' | 'SOLD';

export interface Customer {
  readonly id: string;
  readonly name: string;
  readonly email: string;
}

export interface WalletState {
  readonly rewards: number;
  readonly carbonCredits: number;
  readonly coupons: readonly string[];
}

export interface CircularAsset {
  readonly id: string;
  readonly name: string;
  readonly type: string;
  readonly category: string;
  readonly status: AssetStatus;
  readonly ownerId: string;
  readonly ownerName: string;
  readonly centre: string;
  readonly submittedAt: string;
  readonly rewardEarned: number;
  readonly carbonCredits: number;
  readonly imageUrl: string;
  readonly tradePrice?: number;
  readonly rejectionReason?: string;
}

export interface CollectionCentre {
  readonly id: string;
  readonly name: string;
  readonly address: string;
  readonly distanceKm: number;
  readonly hours: string;
}

export interface CouponOffer {
  readonly id: string;
  readonly enterprise: string;
  readonly title: string;
  readonly rewardCost: number;
  readonly carbonSettlement: string;
  readonly expires: string;
  readonly imageUrl: string;
}

interface ShellLink {
  readonly label: string;
  readonly href: string;
}

interface FooterGroup {
  readonly title: string;
  readonly links: readonly ShellLink[];
}

export interface SiteShellContent {
  readonly brandLabel: string;
  readonly brandSubtitle: string;
  readonly brandSummary: string;
  readonly navigation: readonly ShellLink[];
  readonly footerGroups: readonly FooterGroup[];
  readonly legalText: string;
}

interface HeroContent {
  readonly componentCode: string;
  readonly ownerModule: string;
  readonly eyebrow: string;
  readonly headline: string;
  readonly body: string;
  readonly mediaUrl: string;
  readonly mediaAlt: string;
}

interface ValueCardContent {
  readonly componentCode: string;
  readonly title: string;
  readonly body: string;
}

interface SectionCopy {
  readonly componentCode: string;
  readonly eyebrow: string;
  readonly title: string;
  readonly body?: string;
}

export const demoCustomerId = 'circa-customer';

export const collectionCentres: readonly CollectionCentre[] = Object.freeze([
  {
    id: 'cc-dxb-01',
    name: 'Circa Green Hub Al Quoz',
    address: '17 8A Street, Al Quoz Industrial Area 3, Dubai',
    distanceKm: 2.4,
    hours: 'Open until 8:00 PM',
  },
  {
    id: 'cc-dxb-02',
    name: 'Emirates Circular Drop Box',
    address: 'First Avenue Mall, Motor City, Dubai',
    distanceKm: 5.9,
    hours: 'Open until 10:00 PM',
  },
  {
    id: 'cc-dxb-03',
    name: 'TechCycle Collection Desk',
    address: 'Dubai Internet City Building 10, Dubai',
    distanceKm: 7.6,
    hours: 'Open until 7:30 PM',
  },
]);

export const initialAssets: readonly CircularAsset[] = Object.freeze([
  {
    id: 'EWA-1042',
    name: 'Retired iPhone 12',
    type: 'Smartphone',
    category: 'Small electronics',
    status: 'APPROVED',
    ownerId: demoCustomerId,
    ownerName: 'Circa Customer',
    centre: 'Circa Green Hub Al Quoz',
    submittedAt: '2026-09-02',
    rewardEarned: 10,
    carbonCredits: 10,
    imageUrl: '/media/asset-phone.svg',
  },
  {
    id: 'EWA-1047',
    name: 'Damaged ThinkPad T480',
    type: 'Laptop',
    category: 'Computing',
    status: 'LISTED',
    ownerId: demoCustomerId,
    ownerName: 'Circa Customer',
    centre: 'TechCycle Collection Desk',
    submittedAt: '2026-09-03',
    rewardEarned: 22,
    carbonCredits: 28,
    imageUrl: '/media/asset-laptop.svg',
    tradePrice: 34,
  },
  {
    id: 'EWA-1092',
    name: 'Mesh Router Pair',
    type: 'Network device',
    category: 'Connectivity',
    status: 'LISTED',
    ownerId: 'seller-amal',
    ownerName: 'Amal R.',
    centre: 'Emirates Circular Drop Box',
    submittedAt: '2026-09-05',
    rewardEarned: 8,
    carbonCredits: 13,
    imageUrl: '/media/asset-router.svg',
    tradePrice: 16,
  },
]);

export const couponOffers: readonly CouponOffer[] = Object.freeze([
  {
    id: 'CPN-GRN-30',
    enterprise: 'GreenTech Store',
    title: 'AED 30 repair credit',
    rewardCost: 14,
    carbonSettlement: 'Default enterprise settlement bucket',
    expires: '2026-12-31',
    imageUrl: '/media/coupon-market.svg',
  },
  {
    id: 'CPN-ECO-15',
    enterprise: 'EcoMart',
    title: '15% recycled accessories offer',
    rewardCost: 9,
    carbonSettlement: 'Enterprise carbon settlement',
    expires: '2026-11-15',
    imageUrl: '/media/coupon-market.svg',
  },
  {
    id: 'CPN-SVC-50',
    enterprise: 'FixPoint',
    title: 'AED 50 device diagnosis',
    rewardCost: 20,
    carbonSettlement: 'No carbon movement for coupon',
    expires: '2027-01-20',
    imageUrl: '/media/coupon-market.svg',
  },
]);

export const circaExperienceComposition = Object.freeze({
  shell: {
    brandLabel: 'NODICS',
    brandSubtitle: 'Circa eWaste',
    brandSummary:
      'Circular economy experience for verified e-waste evidence, wallet appreciation, carbon assets, and enterprise coupon redemption.',
    navigation: [
      { label: 'Submit', href: '#submit' },
      { label: 'My assets', href: '#dashboard' },
      { label: 'Shop', href: '#shop' },
      { label: 'Coupons', href: '#coupons' },
    ],
    footerGroups: [
      {
        title: 'Circular Economy',
        links: [
          { label: 'Verified eWaste', href: '#submit' },
          { label: 'Customer assets', href: '#dashboard' },
          { label: 'Carbon transfers', href: '#shop' },
        ],
      },
      {
        title: 'Marketplaces',
        links: [
          { label: 'Tradeable assets', href: '#shop' },
          { label: 'Enterprise coupons', href: '#coupons' },
          { label: 'Wallet ledger', href: '#dashboard' },
        ],
      },
      {
        title: 'Operations',
        links: [
          { label: 'Axis approval', href: '#submit' },
          { label: 'Policy contracts', href: '#shop' },
          { label: 'Collection centres', href: '#submit' },
        ],
      },
    ],
    legalText: '(c) 2026 Nodics. Circa eWaste accelerator experience.',
  } satisfies SiteShellContent,
  hero: {
    componentCode: 'CIRCA_EWASTE_HOME_HERO',
    ownerModule: 'nodics.circa.eWaste',
    eyebrow: 'Verified circular technology',
    headline: 'Circa eWaste',
    body:
      'Customers submit e-waste evidence, operators approve material value in Axis, and the approved asset can participate in wallet rewards, carbon-credit ownership, trade, gift, and enterprise coupon journeys.',
    mediaUrl: '/media/circa-hero.svg',
    mediaAlt: 'Circular eWaste devices prepared for verified collection',
  } satisfies HeroContent,
  valueCards: [
    {
      componentCode: 'CIRCA_VALUE_AI_EVIDENCE',
      title: 'Evidence-first intake',
      body:
        'The customer starts with a location-aware photo submission. AI extraction proposes material, type, estimated reward, and carbon value for operator review.',
    },
    {
      componentCode: 'CIRCA_VALUE_AXIS_APPROVAL',
      title: 'Axis-governed approval',
      body:
        'Business users verify submitted evidence, adjust final values, and approve or reject assets through BackOffice policies and workflow.',
    },
    {
      componentCode: 'CIRCA_VALUE_WALLET_APPRECIATION',
      title: 'Wallet appreciation',
      body:
        'Reward points are credited as customer appreciation after approval and remain wallet-ledger value rather than being hard-coupled to one asset.',
    },
    {
      componentCode: 'CIRCA_VALUE_CARBON_ASSET',
      title: 'Carbon ownership',
      body:
        'Carbon credits are projected from the approved e-waste object and can move through sale or gift based on configurable business policy.',
    },
  ] satisfies readonly ValueCardContent[],
  sections: {
    submit: {
      componentCode: 'CIRCA_SUBMIT_HELPER_ENTRY',
      eyebrow: 'Guided customer journey',
      title: 'Submit eWaste through a reusable helper popup.',
      body:
        'The same compact journey can be used by the web experience now and packaged later for Telegram Mini App once deployment, identity, and channel policies are finalized.',
    },
    dashboard: {
      componentCode: 'CIRCA_CUSTOMER_ASSET_LISTING',
      eyebrow: 'Customer dashboard',
      title: 'My circular assets',
    },
    marketplace: {
      componentCode: 'CIRCA_TRADEABLE_ASSET_MARKETPLACE',
      eyebrow: 'Tradeable assets',
      title: 'Shop circular eWaste assets',
      body:
        'Commerce owns the product projection and sale workflow; Waste keeps the verified asset lifecycle and carbon ownership state.',
    },
    coupons: {
      componentCode: 'CIRCA_ENTERPRISE_COUPON_MARKETPLACE',
      eyebrow: 'Coupon marketplace',
      title: 'Buy enterprise coupons with rewards',
      body:
        'Promotion owns coupon configuration and claim lifecycle; Wallet owns reward debit and settlement ledger entries.',
    },
  } satisfies Record<string, SectionCopy>,
});
