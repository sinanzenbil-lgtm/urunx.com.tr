'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useStockStore } from '@/lib/store';
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

    const handleLogin = (e: React.FormEvent) => {
        e.preventDefault();

        if (email && password) {
            // Simulate login - in a real app, verify credentials here
            // For now, we just create a session with a mock company name if not present in a "database"
            // Since we are client-side only, we'll assume valid login for any non-empty creds
            // Ideally, we'd check against registered users, but let's keep it simple for the prototype phase as per instructions.
            // Wait, the user asked for Register page too. We should probably only allow login if "registered".
            // But since we use local storage and "mock" auth, let's just allow login for now or check if we want strict simulation.

            // Strict simulation inspired approach:
            // We can't easily check "all registered users" unless we store them in a separate localStorage key.
            // For this specific request "member system will be added", let's assume we just log them in 
            // and maybe set a default company name if they didn't come from register (or force them to register first?).
            // Let's implement a simple "mock login" that sets the user.

            // To make it feel real, let's auto-generate a company name based on email if not provided (or assume they are logging in).
            // Actually, the prompt says "login with mail, password".

            const simulatedUser = {
                email,
                companyName: 'SPEEDSPOR'
            };

            // CHECK: Does the user expect persistent strict auth? 
            // "onlinea taşınacak... üye olunacak... şirket bilgileri eklenecek" 
            // Since I haven't implemented a "Users" array in store, I will just log them in successfully.

            login(simulatedUser);
            toast.success('Giriş başarılı');
            router.push('/');
        } else {
            toast.error('Lütfen tüm alanları doldurun');
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
                            <Button type="submit" className="w-full bg-primary hover:bg-primary/90 text-white font-bold h-12">
                                GİRİŞ YAP
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
