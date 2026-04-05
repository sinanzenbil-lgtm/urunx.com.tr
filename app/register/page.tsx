'use client';

import Link from 'next/link';
import { Package } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export default function RegisterPage() {
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
                        <CardTitle className="text-2xl">Kayıt</CardTitle>
                        <CardDescription>
                            Yeni kullanıcı hesapları yönetici tarafından açılır.                             Veritabanında hiç üye yokken giriş sayfasında ilk üyelik formu gösterilir; sonrasında ek
                            hesaplar Ayarlar → Üyelik Yönet üzerinden eklenir.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <p className="text-sm text-zinc-400">
                            İlk kez siteye girdiğinizde veritabanı boşsa giriş sayfasında şirket ve yönetici bilgilerinizi
                            girersiniz; aynı üye adı ve şifre ile sonraki girişlerde de kullanırsınız.
                        </p>
                        <Button asChild className="w-full bg-primary hover:bg-primary/90 text-white font-bold h-12">
                            <Link href="/login">Giriş sayfasına dön</Link>
                        </Button>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
