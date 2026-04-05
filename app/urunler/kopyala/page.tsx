import { Suspense } from 'react';
import CopyForm from './copy-form';

export default function KopyalaPage() {
  return (
    <Suspense
      fallback={
        <div className="max-w-3xl mx-auto p-8 text-zinc-500 text-sm">Yükleniyor...</div>
      }
    >
      <CopyForm />
    </Suspense>
  );
}
