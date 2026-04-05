'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useStockStore } from '@/lib/store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Building2, Package } from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';
import * as dbActions from '@/lib/actions';

type EntryMode = 'loading' | 'firstSetup' | 'login';

export default function LoginPage() {
    const router = useRouter();
    const login = useStockStore((state) => state.login);
    const [mode, setMode] = useState<EntryMode>('loading');

    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [companyName, setCompanyName] = useState('');
    const [firstName, setFirstName] = useState('');
    const [lastName, setLastName] = useState('');
    const [fsUsername, setFsUsername] = useState('');
    const [fsPassword, setFsPassword] = useState('');
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            const res = await dbActions.getNeedsFirstSetup();
            if (cancelled) return;
            setMode(res.needsFirstSetup ? 'firstSetup' : 'login');
        })();
        return () => {
            cancelled = true;
        };
    }, []);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!username.trim() || !password) {
            toast.error('Lütfen üye adı ve şifre girin');
            return;
        }
        setSubmitting(true);
        try {
            const res = await dbActions.loginWithUsername(username.trim(), password);
            if (!res.success) {
                toast.error('Üye adı veya şifre hatalı');
                return;
            }
            login(res.user);
            toast.success('Giriş başarılı');
            router.push('/');
        } catch {
            toast.error('Giriş yapılamadı');
        } finally {
            setSubmitting(false);
        }
    };

    const handleFirstSetup = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!companyName.trim() || !firstName.trim() || !lastName.trim() || !fsUsername.trim()) {
            toast.error('Tüm alanları doldurun');
            return;
        }
        if (fsPassword.length < 4) {
            toast.error('Şifre en az 4 karakter olmalı');
            return;
        }
        setSubmitting(true);
        try {
            const res = await dbActions.completeFirstSetup({
                companyName: companyName.trim(),
                firstName: firstName.trim(),
                lastName: lastName.trim(),
                username: fsUsername.trim(),
                password: fsPassword,
            });
            if (!res.success) {
                if (res.error === 'already_setup') {
                    toast.error('Kurulum zaten yapılmış. Giriş formuna geçiliyor.');
                    setMode('login');
                } else {
                    toast.error('Kurulum tamamlanamadı');
                }
                return;
            }
            login(res.user);
            toast.success('Hesabınız oluşturuldu. Aynı üye adı ve şifre ile tekrar giriş yapabilirsiniz.');
            router.push('/');
        } catch {
            toast.error('Bir hata oluştu');
        } finally {
            setSubmitting(false);
        }
    };

    if (mode === 'loading') {
        return (
            <div className="min-h-screen flex items-center justify-center bg-zinc-950 p-4">
                <p className="text-zinc-500 text-sm">Yükleniyor…</p>
            </div>
        );
    }

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
                    {mode === 'firstSetup' ? (
                        <>
                            <CardHeader>
                                <CardTitle className="text-2xl">İlk üyelik</CardTitle>
                                <CardDescription>
                                    Şirket ve yönetici hesabını oluşturun. Sonraki girişlerde bu sayfada aynı üye adı ve
                                    şifre ile giriş yaparsınız.
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                <form onSubmit={handleFirstSetup} className="space-y-4">
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium text-zinc-300">Şirket adı</label>
                                        <div className="relative">
                                            <Building2 className="absolute left-3 top-3 w-5 h-5 text-zinc-500" />
                                            <Input
                                                type="text"
                                                value={companyName}
                                                onChange={(e) => setCompanyName(e.target.value)}
                                                placeholder="Şirketinizin adı"
                                                className="pl-10 bg-zinc-950 border-zinc-800 focus:border-primary"
                                            />
                                        </div>
                                    </div>
                                    <div className="grid gap-3 sm:grid-cols-2">
                                        <div className="space-y-2">
                                            <label className="text-sm font-medium text-zinc-300">Ad</label>
                                            <Input
                                                value={firstName}
                                                onChange={(e) => setFirstName(e.target.value)}
                                                className="bg-zinc-950 border-zinc-800 focus:border-primary"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-sm font-medium text-zinc-300">Soyad</label>
                                            <Input
                                                value={lastName}
                                                onChange={(e) => setLastName(e.target.value)}
                                                className="bg-zinc-950 border-zinc-800 focus:border-primary"
                                            />
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium text-zinc-300">Üye adı (giriş)</label>
                                        <Input
                                            type="text"
                                            autoComplete="username"
                                            value={fsUsername}
                                            onChange={(e) => setFsUsername(e.target.value)}
                                            className="bg-zinc-950 border-zinc-800 focus:border-primary"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium text-zinc-300">Şifre</label>
                                        <Input
                                            type="password"
                                            autoComplete="new-password"
                                            value={fsPassword}
                                            onChange={(e) => setFsPassword(e.target.value)}
                                            className="bg-zinc-950 border-zinc-800 focus:border-primary"
                                        />
                                    </div>
                                    <Button
                                        type="submit"
                                        disabled={submitting}
                                        className="w-full bg-primary hover:bg-primary/90 text-white font-bold h-12"
                                    >
                                        {submitting ? 'Kaydediliyor…' : 'Hesabı oluştur ve gir'}
                                    </Button>
                                </form>
                            </CardContent>
                        </>
                    ) : (
                        <>
                            <CardHeader>
                                <CardTitle className="text-2xl">Giriş Yap</CardTitle>
                                <CardDescription>
                                    İlk kurulumda oluşturduğunuz veya yöneticinin verdiği üye adı ve şifre ile girin.
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                <form onSubmit={handleLogin} className="space-y-4">
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium text-zinc-300">Üye adı</label>
                                        <Input
                                            type="text"
                                            autoComplete="username"
                                            placeholder="Kullanıcı adınız"
                                            value={username}
                                            onChange={(e) => setUsername(e.target.value)}
                                            className="bg-zinc-950 border-zinc-800 focus:border-primary"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium text-zinc-300">Şifre</label>
                                        <Input
                                            type="password"
                                            autoComplete="current-password"
                                            placeholder="••••••••"
                                            value={password}
                                            onChange={(e) => setPassword(e.target.value)}
                                            className="bg-zinc-950 border-zinc-800 focus:border-primary"
                                        />
                                    </div>
                                    <Button
                                        type="submit"
                                        disabled={submitting}
                                        className="w-full bg-primary hover:bg-primary/90 text-white font-bold h-12"
                                    >
                                        {submitting ? 'Giriş…' : 'GİRİŞ YAP'}
                                    </Button>
                                </form>
                            </CardContent>
                            <CardFooter className="flex flex-col gap-2 border-t border-zinc-800 pt-6">
                                <p className="text-sm text-zinc-500 text-center">
                                    Ek kullanıcılar Ayarlar → Üyelik Yönet üzerinden açılır.
                                </p>
                                <p className="text-sm text-zinc-500 text-center">
                                    <Link href="/register" className="text-primary hover:text-primary/80 font-medium">
                                        Bilgi — kayıt
                                    </Link>
                                </p>
                            </CardFooter>
                        </>
                    )}
                </Card>
            </div>
        </div>
    );
}
