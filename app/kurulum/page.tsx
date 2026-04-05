import { redirect } from 'next/navigation';

/** Eski bağlantılar için; ilk üyelik artık /login sayfasında. */
export default function KurulumPage() {
    redirect('/login');
}
