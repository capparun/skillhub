'use client';

import { useEffect, useState } from 'react';
import styles from './product-section-nav.module.css';

type Section = { id: string; label: string };

export function ProductSectionNav({ sections, className = '' }: { sections: Section[]; className?: string }) {
  const [active, setActive] = useState(sections[0]?.id ?? '');
  useEffect(() => {
    const sync = () => setActive(window.location.hash.slice(1) || sections[0]?.id || '');
    const frame = requestAnimationFrame(sync);
    window.addEventListener('hashchange', sync);
    return () => { cancelAnimationFrame(frame); window.removeEventListener('hashchange', sync); };
  }, [sections]);
  return <nav className={`${styles.nav} ${className}`} aria-label="产品页导航">
    {sections.map(section => <a key={section.id} href={`#${section.id}`} aria-current={active === section.id ? 'location' : undefined} onClick={() => setActive(section.id)}>{section.label}</a>)}
  </nav>;
}
