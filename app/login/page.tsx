'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useStockStore } from '@/lib/store';
import * as dbActions from '@/lib/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Package } from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';

export default function LoginPage() {
    const router = useRouter();
    const login = useStockStore((state) => state.login);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [submitting, setSubmitting] = useState(false);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!email || !password) {
            toast.error('Lütfen tüm alanları doldurun');
            return;
        }

        setSubmitting(true);
        try {
            const result = await dbActions.authenticateUser({ email, password });
            if (!result.success || !result.user) {
                toast.error(typeof result.error === 'string' ? result.error : 'Giriş başarısız');
                return;
            }

            login(result.user);
            toast.success('Giriş başarılı');
            router.push('/');
        } catch (error) {
            console.error(error);
            toast.error('Giriş sırasında beklenmeyen bir hata oluştu');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-zinc-950 p-4">
            <div className="w-full max-w-md space-y-8 animate-enter">
                <div className="flex flex-col items-center justify-center text-center">
                    <div className="bg-primary p-3 rounded-xl text-white mb-4">
                        <Package size={40} />
                    </div>
                    <h1 className="text-4xl font-bold tracking-tighter text-white">URUNX</h1>
                    <p className="text-zinc-500 mt-2">B2B Stok & Ürün Yönetim Platformu</p>
                </div>

                <Card className="border-zinc-800 bg-zinc-900/50 backdrop-blur-2xl">
                    <CardHeader>
                        <CardTitle className="text-2xl">Giriş Yap</CardTitle>
                        <CardDescription>Hesabınıza erişmek için bilgilerinizi girin</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <form onSubmit={handleLogin} className="space-y-4">
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-zinc-300">E-Posta</label>
                                <Input
                                    type="email"
                                    placeholder="ornek@sirket.com"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    className="bg-zinc-950 border-zinc-800 focus:border-primary"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-zinc-300">Şifre</label>
                                <Input
                                    type="password"
                                    placeholder="••••••••"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="bg-zinc-950 border-zinc-800 focus:border-primary"
                                />
                            </div>
                            <Button type="submit" disabled={submitting} className="w-full bg-primary hover:bg-primary/90 text-white font-bold h-12 disabled:opacity-60">
                                {submitting ? 'GİRİŞ YAPILIYOR...' : 'GİRİŞ YAP'}
                            </Button>
                        </form>
                    </CardContent>
                    <CardFooter className="flex justify-center border-t border-zinc-800 pt-6">
                        <p className="text-sm text-zinc-500">
                            Hesabınız yok mu?{' '}
                            <Link href="/register" className="text-primary hover:text-primary/80 font-medium">
                                Hemen Üye Olun
                            </Link>
                        </p>
                    </CardFooter>
                </Card>
            </div>
        </div>
    );
}
