import {
  ArrowRight,
  BadgeCheck,
  Camera,
  Coins,
  Gift,
  Leaf,
  LocateFixed,
  MapPinned,
  PackageCheck,
  Search,
  ShieldCheck,
  ShoppingBag,
  Store,
  Upload,
  Wallet,
} from 'lucide-react';
import { useMemo, useState } from 'react';

import {
  circaExperienceComposition,
  collectionCentres,
  couponOffers,
  demoCustomerId,
  initialAssets,
  type AssetStatus,
  type CircularAsset,
  type CollectionCentre,
  type CouponOffer,
  type Customer,
  type WalletState,
} from './circaExperience';
import { NodicsSiteShell } from './NodicsSiteShell';

type SubmitStep =
  | 'AUTH_REQUIRED'
  | 'LOCATION_CHECK'
  | 'NEARBY_CENTRES'
  | 'EVIDENCE_CAPTURE'
  | 'AI_SUMMARY_CONFIRM'
  | 'UNDER_APPROVAL';

function statusLabel(status: AssetStatus): string {
  switch (status) {
    case 'PENDING_REVIEW':
      return 'Under approval';
    case 'APPROVED':
      return 'Approved';
    case 'REJECTED':
      return 'Rejected';
    case 'LISTED':
      return 'Listed for trade';
    case 'SOLD':
      return 'Sold';
  }
}

function nextAssetCode(): string {
  const suffix =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().slice(0, 4).toUpperCase()
      : Math.floor(Math.random() * 9000 + 1000).toString();
  return `EWA-${suffix}`;
}

function LoginPanel({
  compact = false,
  onLogin,
}: {
  readonly compact?: boolean;
  readonly onLogin: (customer: Customer) => void;
}) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('Circa Customer');
  const [email, setEmail] = useState('customer@circa.local');
  const [password, setPassword] = useState('circa-demo');

  const submit = () => {
    const nextName = mode === 'register' ? name.trim() : 'Circa Customer';
    onLogin({
      id: demoCustomerId,
      name: nextName || 'Circa Customer',
      email: email.trim() || 'customer@circa.local',
    });
  };

  return (
    <div className={compact ? 'auth-panel compact' : 'auth-panel'}>
      <div>
        <p className="eyebrow">{mode === 'login' ? 'Welcome back' : 'Create account'}</p>
        <h3>{mode === 'login' ? 'Login to continue' : 'Start with three details'}</h3>
      </div>
      <div className="segmented" role="tablist" aria-label="Authentication mode">
        <button
          className={mode === 'login' ? 'active' : ''}
          onClick={() => setMode('login')}
          type="button"
        >
          Login
        </button>
        <button
          className={mode === 'register' ? 'active' : ''}
          onClick={() => setMode('register')}
          type="button"
        >
          New customer
        </button>
      </div>
      {mode === 'register' ? (
        <label>
          Name
          <input value={name} onChange={(event) => setName(event.target.value)} />
        </label>
      ) : null}
      <label>
        Email
        <input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </label>
      <label>
        Password
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </label>
      <button
        aria-label={mode === 'register' ? 'Register and login customer' : 'Login customer'}
        className="primary-action"
        onClick={submit}
        type="button"
      >
        {mode === 'register' ? 'Register and login' : 'Login'}
      </button>
    </div>
  );
}

function SubmitWastePopup({
  customer,
  open,
  onClose,
  onLogin,
  onSubmitAsset,
}: {
  readonly customer: Customer | undefined;
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onLogin: (customer: Customer) => void;
  readonly onSubmitAsset: (asset: CircularAsset) => void;
}) {
  const [step, setStep] = useState<SubmitStep>('AUTH_REQUIRED');
  const [selectedCentre, setSelectedCentre] = useState<CollectionCentre>(collectionCentres[0]);
  const [imagePreview, setImagePreview] = useState('/media/asset-phone.svg');
  const [isAnalyzing, setAnalyzing] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);

  if (!open) return null;

  const activeStep = customer
    ? step === 'AUTH_REQUIRED'
      ? 'LOCATION_CHECK'
      : step
    : 'AUTH_REQUIRED';

  const analyze = () => {
    setAnalyzing(true);
    window.setTimeout(() => {
      setAnalyzing(false);
      setStep('AI_SUMMARY_CONFIRM');
    }, 450);
  };

  const submitForApproval = () => {
    onSubmitAsset({
      id: nextAssetCode(),
      name: 'AI named smartphone evidence',
      type: 'Smartphone',
      category: 'Small electronics',
      status: 'PENDING_REVIEW',
      ownerId: customer?.id ?? demoCustomerId,
      ownerName: customer?.name ?? 'Circa Customer',
      centre: selectedCentre.name,
      submittedAt: new Date().toISOString().slice(0, 10),
      rewardEarned: 12,
      carbonCredits: 14,
      imageUrl: imagePreview,
    });
    setStep('UNDER_APPROVAL');
  };

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="submission-modal" role="dialog" aria-modal="true" aria-label="Submit eWaste">
        <div className="modal-header">
          <div>
            <p className="eyebrow">AI assisted submission</p>
            <h2>Submit eWaste</h2>
          </div>
          <button className="icon-button" onClick={onClose} type="button" aria-label="Close">
            x
          </button>
        </div>

        <div className="stepper" aria-label="Submission progress">
          {['Login', 'Location', 'Photo', 'Confirm'].map((label) => (
            <span key={label}>{label}</span>
          ))}
        </div>

        {activeStep === 'AUTH_REQUIRED' ? (
          <LoginPanel
            compact
            onLogin={(nextCustomer) => {
              onLogin(nextCustomer);
              setStep('LOCATION_CHECK');
            }}
          />
        ) : null}

        {activeStep === 'LOCATION_CHECK' ? (
          <div className="modal-section">
            <LocateFixed size={34} />
            <h3>Share location to find nearby collection centres</h3>
            <p>
              Circa checks proximity against configured collection centres before
              collecting evidence, so the physical handoff remains operationally valid.
            </p>
            <div className="action-row">
              <button
                className="primary-action"
                onClick={() => setStep('NEARBY_CENTRES')}
                type="button"
              >
                Share location
              </button>
              <button
                className="secondary-action"
                onClick={() => setStep('NEARBY_CENTRES')}
                type="button"
              >
                Use sample location
              </button>
            </div>
          </div>
        ) : null}

        {activeStep === 'NEARBY_CENTRES' ? (
          <div className="modal-section">
            <h3>Nearby collection centres</h3>
            <p>Select the centre where the item can be received and verified.</p>
            <div className="centre-list">
              {collectionCentres.map((centre) => (
                <button
                  className={centre.id === selectedCentre.id ? 'centre-card selected' : 'centre-card'}
                  key={centre.id}
                  onClick={() => setSelectedCentre(centre)}
                  type="button"
                >
                  <strong>{centre.name}</strong>
                  <span>{centre.address}</span>
                  <small>
                    {centre.distanceKm.toFixed(1)} km - {centre.hours}
                  </small>
                </button>
              ))}
            </div>
            {mapOpen ? (
              <div className="mini-map" aria-label="Collection centre map preview">
                {collectionCentres.map((centre, index) => (
                  <span
                    className={centre.id === selectedCentre.id ? 'pin active' : 'pin'}
                    key={centre.id}
                    style={{
                      left: `${String(18 + index * 28)}%`,
                      top: `${String(56 - index * 14)}%`,
                    }}
                  >
                    {index + 1}
                  </span>
                ))}
              </div>
            ) : null}
            <div className="action-row">
              <button className="secondary-action" onClick={() => setMapOpen(true)} type="button">
                <MapPinned size={16} />
                See on map
              </button>
              <button
                className="primary-action"
                onClick={() => setStep('EVIDENCE_CAPTURE')}
                type="button"
              >
                Continue to photo
              </button>
            </div>
          </div>
        ) : null}

        {activeStep === 'EVIDENCE_CAPTURE' ? (
          <div className="modal-section">
            <h3>Upload or capture the item photo</h3>
            <p>The image becomes the evidence object for AI extraction and Axis review.</p>
            <div className="evidence-grid">
              <img src={imagePreview} alt="Selected eWaste evidence preview" />
              <div className="upload-actions">
                <label className="file-action">
                  <Upload size={18} />
                  Upload image
                  <input
                    accept="image/*"
                    type="file"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file && URL.createObjectURL) {
                        setImagePreview(URL.createObjectURL(file));
                      }
                    }}
                  />
                </label>
                <label className="file-action">
                  <Camera size={18} />
                  Camera
                  <input
                    accept="image/*"
                    capture="environment"
                    type="file"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file && URL.createObjectURL) {
                        setImagePreview(URL.createObjectURL(file));
                      }
                    }}
                  />
                </label>
                <button
                  className="secondary-action"
                  onClick={() => setImagePreview('/media/asset-phone.svg')}
                  type="button"
                >
                  Use sample photo
                </button>
              </div>
            </div>
            <button className="primary-action wide" onClick={analyze} type="button">
              {isAnalyzing ? 'Analyzing evidence' : 'Extract evidence with AI'}
            </button>
          </div>
        ) : null}

        {activeStep === 'AI_SUMMARY_CONFIRM' ? (
          <div className="modal-section">
            <h3>Confirm extracted eWaste value</h3>
            <div className="summary-grid">
              <div>
                <span>Name</span>
                <strong>AI named smartphone evidence</strong>
              </div>
              <div>
                <span>Type</span>
                <strong>Smartphone</strong>
              </div>
              <div>
                <span>Reward estimate</span>
                <strong>12 points</strong>
              </div>
              <div>
                <span>Carbon estimate</span>
                <strong>14 credits</strong>
              </div>
            </div>
            <p>
              Reward appreciation is credited to the customer wallet after approval.
              Carbon credits remain part of the approved asset projection and move by
              configurable transfer policy.
            </p>
            <button className="primary-action wide" onClick={submitForApproval} type="button">
              Confirm and submit for approval
            </button>
          </div>
        ) : null}

        {activeStep === 'UNDER_APPROVAL' ? (
          <div className="modal-section success">
            <PackageCheck size={42} />
            <h3>Your asset is under approval</h3>
            <p>
              A Circa operator will verify the evidence in Axis. Dashboard status and
              wallet movement are updated after final approval.
            </p>
            <button className="primary-action" onClick={onClose} type="button">
              View dashboard
            </button>
          </div>
        ) : null}
      </section>
    </div>
  );
}

function AssetCard({
  asset,
  owned,
  onBuy,
  onGift,
  onList,
  onSelect,
}: {
  readonly asset: CircularAsset;
  readonly owned: boolean;
  readonly onBuy?: (asset: CircularAsset) => void;
  readonly onGift?: (asset: CircularAsset) => void;
  readonly onList?: (asset: CircularAsset) => void;
  readonly onSelect: (asset: CircularAsset) => void;
}) {
  return (
    <article className="product-card asset-product-card">
      <button className="image-button" onClick={() => onSelect(asset)} type="button">
        <img src={asset.imageUrl} alt={asset.name} />
        <span className={`status ${asset.status.toLowerCase()}`}>{statusLabel(asset.status)}</span>
      </button>
      <div className="quick-actions" aria-label={`${asset.name} quick actions`}>
        <button onClick={() => onSelect(asset)} type="button" aria-label={`View ${asset.name}`}>
          <BadgeCheck size={16} />
        </button>
        {owned && ['APPROVED', 'LISTED'].includes(asset.status) && onGift ? (
          <button onClick={() => onGift(asset)} type="button" aria-label={`Gift ${asset.name}`}>
            <Gift size={16} />
          </button>
        ) : null}
      </div>
      <div className="product-card-content">
        <div className="product-meta">
          <span>{asset.category}</span>
          <span>{asset.id}</span>
        </div>
        <h3>{asset.name}</h3>
        <p>{asset.type} verified through {asset.centre}.</p>
        <div className="metric-row">
          <span><Coins size={15} /> {asset.rewardEarned} reward appreciation</span>
          <span><Leaf size={15} /> {asset.carbonCredits} carbon credits</span>
        </div>
        <div className="price-row">
          <strong>{asset.tradePrice ? `${asset.tradePrice} rewards` : 'Not listed'}</strong>
          <small>{asset.ownerName}</small>
        </div>
        <div className="product-card-actions">
          <button className="secondary-action" onClick={() => onSelect(asset)} type="button">
            Details
          </button>
          {owned && asset.status === 'APPROVED' && onList ? (
            <button className="primary-action" onClick={() => onList(asset)} type="button">
              Trade
            </button>
          ) : null}
          {!owned && asset.status === 'LISTED' && onBuy ? (
            <button className="primary-action" onClick={() => onBuy(asset)} type="button">
              Bid / buy
            </button>
          ) : null}
        </div>
      </div>
    </article>
  );
}

function AssetDetailPanel({ asset }: { readonly asset: CircularAsset }) {
  return (
    <aside className="asset-detail-panel" aria-label="Asset detail">
      <div className="detail-media">
        <img src={asset.imageUrl} alt={asset.name} />
      </div>
      <div className="detail-copy">
        <span className={`status ${asset.status.toLowerCase()}`}>{statusLabel(asset.status)}</span>
        <p className="eyebrow">Verified circular asset</p>
        <h3>{asset.name}</h3>
        <p>
          {asset.type} submitted through {asset.centre}. The reward appreciation is
          wallet-ledger value; carbon credits follow the asset transfer policy.
        </p>
        <dl>
          <div><dt>Asset code</dt><dd>{asset.id}</dd></div>
          <div><dt>Reward earned</dt><dd>{asset.rewardEarned}</dd></div>
          <div><dt>Carbon credits</dt><dd>{asset.carbonCredits}</dd></div>
          <div><dt>Submitted</dt><dd>{asset.submittedAt}</dd></div>
        </dl>
      </div>
    </aside>
  );
}

function CouponCard({
  coupon,
  onBuy,
}: {
  readonly coupon: CouponOffer;
  readonly onBuy: (coupon: CouponOffer) => void;
}) {
  return (
    <article className="product-card coupon-product-card">
      <div className="image-button as-media">
        <img src={coupon.imageUrl} alt={coupon.title} />
      </div>
      <div className="product-card-content">
        <div className="product-meta">
          <span><Store size={15} /> {coupon.enterprise}</span>
          <span>{coupon.id}</span>
        </div>
        <h3>{coupon.title}</h3>
        <p>{coupon.carbonSettlement}</p>
        <div className="price-row">
          <strong>{coupon.rewardCost} rewards</strong>
          <small>Expires {coupon.expires}</small>
        </div>
        <div className="product-card-actions">
          <button className="primary-action" onClick={() => onBuy(coupon)} type="button">
            Buy for {coupon.rewardCost} rewards
          </button>
        </div>
      </div>
    </article>
  );
}

export function CircaApp() {
  const experience = circaExperienceComposition;
  const [customer, setCustomer] = useState<Customer>();
  const [wallet, setWallet] = useState<WalletState>({
    rewards: 48,
    carbonCredits: 38,
    coupons: [],
  });
  const [assets, setAssets] = useState<readonly CircularAsset[]>(initialAssets);
  const [statusFilter, setStatusFilter] = useState<'ALL' | AssetStatus>('ALL');
  const [query, setQuery] = useState('');
  const [submitOpen, setSubmitOpen] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const [selectedAsset, setSelectedAsset] = useState<CircularAsset>(initialAssets[0]);
  const [notice, setNotice] = useState(
    'Local component payload is active until WCMS and Circa backend contracts are connected.',
  );

  const ownedAssets = useMemo(
    () => assets.filter((asset) => asset.ownerId === demoCustomerId),
    [assets],
  );

  const filteredOwnedAssets = useMemo(
    () =>
      ownedAssets.filter((asset) => {
        const statusMatches = statusFilter === 'ALL' || asset.status === statusFilter;
        const text = `${asset.name} ${asset.type} ${asset.category} ${asset.centre}`.toLowerCase();
        return statusMatches && text.includes(query.toLowerCase());
      }),
    [ownedAssets, query, statusFilter],
  );

  const listedAssets = assets.filter((asset) => asset.status === 'LISTED');

  const login = (nextCustomer: Customer) => {
    setCustomer(nextCustomer);
    setLoginOpen(false);
    setNotice(`${nextCustomer.name} is signed in. Wallet and owned assets are active.`);
  };

  const listAsset = (asset: CircularAsset) => {
    setAssets((current) =>
      current.map((item) =>
        item.id === asset.id ? { ...item, status: 'LISTED', tradePrice: 18 } : item,
      ),
    );
    setNotice(`${asset.name} is listed in the asset marketplace. Rewards stay in your wallet.`);
  };

  const giftAsset = (asset: CircularAsset) => {
    setAssets((current) =>
      current.map((item) =>
        item.id === asset.id
          ? { ...item, status: 'SOLD', ownerId: 'gift-recipient', ownerName: 'Gift recipient' }
          : item,
      ),
    );
    setWallet((current) => ({
      ...current,
      carbonCredits: Math.max(0, current.carbonCredits - asset.carbonCredits),
    }));
    setNotice(
      `${asset.name} was gifted. Carbon credits moved with the asset; attached rewards are policy controlled.`,
    );
  };

  const buyAsset = (asset: CircularAsset) => {
    const price = asset.tradePrice ?? 0;
    if (wallet.rewards < price) {
      setNotice('Wallet rewards are not enough for this bid.');
      return;
    }
    setWallet((current) => ({
      ...current,
      rewards: current.rewards - price,
      carbonCredits: current.carbonCredits + asset.carbonCredits,
    }));
    setAssets((current) =>
      current.map((item) =>
        item.id === asset.id
          ? { ...item, status: 'APPROVED', ownerId: demoCustomerId, ownerName: 'Circa Customer' }
          : item,
      ),
    );
    setNotice(
      `${asset.name} purchased for ${price.toString()} rewards. Carbon credits transferred to your wallet projection.`,
    );
  };

  const buyCoupon = (coupon: CouponOffer) => {
    if (wallet.rewards < coupon.rewardCost) {
      setNotice('Wallet rewards are not enough for this coupon.');
      return;
    }
    setWallet((current) => ({
      ...current,
      rewards: current.rewards - coupon.rewardCost,
      coupons: [...current.coupons, coupon.id],
    }));
    setNotice(
      `${coupon.title} is now customer owned. Claim code is ready for ${coupon.enterprise}.`,
    );
  };

  const accountSlot = customer ? (
    <button className="account-pill" type="button">
      <Wallet size={16} />
      {wallet.rewards} rewards
    </button>
  ) : (
    <button
      aria-label="Open customer login"
      className="secondary-action"
      onClick={() => setLoginOpen(true)}
      type="button"
    >
      Login
    </button>
  );

  return (
    <NodicsSiteShell accountSlot={accountSlot} notice={notice} shell={experience.shell}>
      <main className="circa-main">
        <section
          className="circa-hero"
          data-component-code={experience.hero.componentCode}
          data-owner-module={experience.hero.ownerModule}
          id="home"
        >
          <div className="hero-copy">
            <p className="eyebrow">{experience.hero.eyebrow}</p>
            <h1>{experience.hero.headline}</h1>
            <p>{experience.hero.body}</p>
            <div className="hero-actions">
              <button
                aria-label="Start Submit eWaste"
                className="primary-action"
                onClick={() => setSubmitOpen(true)}
                type="button"
              >
                Submit eWaste
                <ArrowRight size={18} />
              </button>
              <a className="text-action" href="#shop">Explore marketplace</a>
            </div>
          </div>
          <div className="hero-media">
            <img src={experience.hero.mediaUrl} alt={experience.hero.mediaAlt} />
          </div>
        </section>

        <section className="value-band" aria-label="Circa value proposition">
          {experience.valueCards.map((card) => (
            <article data-component-code={card.componentCode} key={card.componentCode}>
              <ShieldCheck size={22} />
              <h3>{card.title}</h3>
              <p>{card.body}</p>
            </article>
          ))}
        </section>

        <section
          className="submit-strip"
          data-component-code={experience.sections.submit.componentCode}
          id="submit"
        >
          <div>
            <p className="eyebrow">{experience.sections.submit.eyebrow}</p>
            <h2>{experience.sections.submit.title}</h2>
            <p>{experience.sections.submit.body}</p>
          </div>
          <button className="primary-action" onClick={() => setSubmitOpen(true)} type="button">
            Open Submit eWaste
          </button>
        </section>

        <section
          className="dashboard-section"
          data-component-code={experience.sections.dashboard.componentCode}
          id="dashboard"
        >
          <div className="section-heading">
            <div>
              <p className="eyebrow">{experience.sections.dashboard.eyebrow}</p>
              <h2>{experience.sections.dashboard.title}</h2>
            </div>
            <div className="wallet-summary" aria-label="Wallet summary">
              <span><Coins size={18} /> {wallet.rewards} rewards</span>
              <span><Leaf size={18} /> {wallet.carbonCredits} carbon</span>
              <span><ShoppingBag size={18} /> {wallet.coupons.length} coupons</span>
            </div>
          </div>

          {!customer ? (
            <div className="inline-login">
              <LoginPanel compact onLogin={login} />
            </div>
          ) : (
            <>
              <div className="filters">
                <label>
                  <Search size={16} />
                  <input
                    placeholder="Search assets"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                  />
                </label>
                <select
                  aria-label="Asset status filter"
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value as 'ALL' | AssetStatus)}
                >
                  <option value="ALL">All statuses</option>
                  <option value="PENDING_REVIEW">Under approval</option>
                  <option value="APPROVED">Approved</option>
                  <option value="LISTED">Listed</option>
                  <option value="REJECTED">Rejected</option>
                  <option value="SOLD">Sold</option>
                </select>
              </div>
              <div className="asset-layout">
                <div className="grid product-grid">
                  {filteredOwnedAssets.map((asset) => (
                    <AssetCard
                      asset={asset}
                      key={asset.id}
                      owned
                      onGift={giftAsset}
                      onList={listAsset}
                      onSelect={setSelectedAsset}
                    />
                  ))}
                </div>
                <AssetDetailPanel asset={selectedAsset} />
              </div>
            </>
          )}
        </section>

        <section
          className="market-section"
          data-component-code={experience.sections.marketplace.componentCode}
          id="shop"
        >
          <div className="section-heading">
            <div>
              <p className="eyebrow">{experience.sections.marketplace.eyebrow}</p>
              <h2>{experience.sections.marketplace.title}</h2>
            </div>
            <span className="contract-note">{experience.sections.marketplace.body}</span>
          </div>
          <div className="grid product-grid">
            {listedAssets.map((asset) => (
              <AssetCard
                asset={asset}
                key={asset.id}
                owned={asset.ownerId === demoCustomerId}
                onBuy={buyAsset}
                onGift={giftAsset}
                onList={listAsset}
                onSelect={setSelectedAsset}
              />
            ))}
          </div>
        </section>

        <section
          className="coupon-section"
          data-component-code={experience.sections.coupons.componentCode}
          id="coupons"
        >
          <div className="section-heading">
            <div>
              <p className="eyebrow">{experience.sections.coupons.eyebrow}</p>
              <h2>{experience.sections.coupons.title}</h2>
            </div>
            <span className="contract-note">{experience.sections.coupons.body}</span>
          </div>
          <div className="grid product-grid">
            {couponOffers.map((coupon) => (
              <CouponCard coupon={coupon} key={coupon.id} onBuy={buyCoupon} />
            ))}
          </div>
        </section>
      </main>

      {loginOpen ? (
        <div className="modal-backdrop" role="presentation">
          <section className="login-modal" role="dialog" aria-modal="true" aria-label="Customer login">
            <button className="icon-button close-login" onClick={() => setLoginOpen(false)} type="button" aria-label="Close login">
              x
            </button>
            <LoginPanel onLogin={login} />
          </section>
        </div>
      ) : null}

      <SubmitWastePopup
        customer={customer}
        open={submitOpen}
        onClose={() => setSubmitOpen(false)}
        onLogin={login}
        onSubmitAsset={(asset) => {
          setAssets((current) => [asset, ...current]);
          setSelectedAsset(asset);
          setNotice(`${asset.name} is waiting for Axis approval.`);
        }}
      />
    </NodicsSiteShell>
  );
}
