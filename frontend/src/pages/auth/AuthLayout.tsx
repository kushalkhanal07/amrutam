import type { ReactNode } from 'react';
import { Logo } from '@/components/ui/Logo';
import { BotanicalMark, Picture } from '@/components/ui/Picture';

interface AuthLayoutProps {
  title: string;
  subtitle: string;
  children: ReactNode;
  aside: { heading: string; text: string; image: string; alt: string };
}

/** Split layout on desktop; focused single column on mobile. */
export function AuthLayout({ title, subtitle, children, aside }: AuthLayoutProps) {
  return (
    <div className="min-h-screen bg-cream lg:grid lg:grid-cols-[1fr_1fr]">
      <div className="flex min-h-screen flex-col px-5 py-6 sm:px-10 lg:min-h-0 lg:py-10">
        <Logo />
        <div className="animate-rise mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-10">
          <h1 className="font-display text-3xl text-forest-deep">{title}</h1>
          <p className="mt-2 text-muted">{subtitle}</p>
          <div className="mt-8">{children}</div>
        </div>
        <p className="text-xs text-muted">Demo application. Not for medical emergencies.</p>
      </div>
      <div className="relative hidden overflow-hidden bg-forest-deep lg:block">
        <Picture src={aside.image} alt={aside.alt} fallbackTone="forest" className="absolute inset-0 h-full w-full opacity-80" />
        <div className="absolute inset-0 bg-gradient-to-t from-forest-deep via-forest-deep/40 to-transparent" aria-hidden />
        <BotanicalMark className="absolute -right-16 top-10 h-72 w-72 text-sage/30" />
        <div className="absolute inset-x-0 bottom-0 p-12 text-white">
          <p className="font-display max-w-md text-3xl leading-snug">{aside.heading}</p>
          <p className="mt-3 max-w-md text-sage">{aside.text}</p>
        </div>
      </div>
    </div>
  );
}
