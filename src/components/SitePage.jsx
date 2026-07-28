export default function SitePage({ eyebrow, title, subtitle, actions, children, bleed = false }) {
  return (
    <div className="ac-product-page">
      {(title || subtitle || actions) && (
        <header className="ac-product-hero">
          {eyebrow && <p className="ac-product-eyebrow">{eyebrow}</p>}
          {title && <h1 className="ac-product-headline">{title}</h1>}
          {subtitle && <p className="ac-product-subhead">{subtitle}</p>}
          {actions && <div className="ac-product-cta">{actions}</div>}
        </header>
      )}
      <div className={`ac-product-body${bleed ? ' ac-product-body--bleed' : ''}`}>
        {children}
      </div>
    </div>
  );
}
