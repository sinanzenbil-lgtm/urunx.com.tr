'use client';

import { useEffect, useState } from 'react';
import { useStockStore } from '@/lib/store';
import { CompanySettings } from '@/types';
import * as dbActions from '@/lib/actions';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Building2, KeyRound, Mail, Save, Settings, Upload } from 'lucide-react';

const EMPTY_SETTINGS: CompanySettings = {
  companyName: '',
  tradeName: '',
  address: '',
  phone: '',
  email: '',
  logo: '',
  stockInterestMonthlyRate: 0,
};

export default function SettingsPage() {
  const user = useStockStore((state) => state.user);
  const login = useStockStore((state) => state.login);

  const [settings, setSettings] = useState<CompanySettings>(EMPTY_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [emailSaving, setEmailSaving] = useState(false);
  const [passwordSaving, setPasswordSaving] = useState(false);

  const [emailDialogOpen, setEmailDialogOpen] = useState(false);
  const [newMembershipEmail, setNewMembershipEmail] = useState(user?.email || '');

  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [newPasswordAgain, setNewPasswordAgain] = useState('');
  const isEmbeddedLogo = (settings.logo || '').startsWith('data:image');
  const logoInputValue = isEmbeddedLogo ? '' : (settings.logo || '');

  useEffect(() => {
    setNewMembershipEmail(user?.email || '');
  }, [user?.email]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const res = await dbActions.getCompanySettings();
      if (cancelled) return;
      if (!res.success) {
        toast.error('Ayarlar yüklenemedi');
        setLoading(false);
        return;
      }
      const next = res.settings || EMPTY_SETTINGS;
      setSettings({
        companyName: next.companyName || user?.companyName || '',
        tradeName: next.tradeName || '',
        address: next.address || '',
        phone: next.phone || '',
        email: next.email || user?.email || '',
        logo: next.logo || '',
        stockInterestMonthlyRate: Number(next.stockInterestMonthlyRate) || 0,
      });
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [user?.companyName, user?.email]);

  const onLogoFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = String(reader.result || '');
      setSettings((prev) => ({ ...prev, logo: base64 }));
      toast.success('Logo yüklendi');
    };
    reader.readAsDataURL(file);
  };

  const saveSettings = async () => {
    setSaving(true);
    const toastId = toast.loading('Ayarlar kaydediliyor...');
    try {
      const payload: CompanySettings = {
        companyName: settings.companyName.trim(),
        tradeName: settings.tradeName.trim(),
        address: settings.address.trim(),
        phone: settings.phone.trim(),
        email: settings.email.trim(),
        logo: (settings.logo || '').trim(),
        stockInterestMonthlyRate: Number(settings.stockInterestMonthlyRate) || 0,
      };
      const res = await dbActions.upsertCompanySettings(payload);
      if (!res.success) throw new Error('save_failed');
      if (user) {
        login({ ...user, companyName: payload.companyName || user.companyName });
      }
      toast.success('Ayarlar kaydedildi', { id: toastId });
    } catch (error) {
      console.error(error);
      toast.error('Ayarlar kaydedilemedi', { id: toastId });
    } finally {
      setSaving(false);
    }
  };

  const saveMembershipEmail = async () => {
    const email = newMembershipEmail.trim();
    if (!email || !email.includes('@')) {
      toast.error('Geçerli bir e-posta girin');
      return;
    }
    if (!user) {
      toast.error('Aktif kullanıcı bulunamadı');
      return;
    }

    setEmailSaving(true);
    try {
      const res = await dbActions.updateUserEmail({
        currentEmail: user.email,
        newEmail: email,
        companyName: settings.companyName || user.companyName,
      });
      if (!res.success || !res.user) {
        toast.error(typeof res.error === 'string' ? res.error : 'Üyelik maili güncellenemedi');
        return;
      }
      login(res.user);
      setSettings((prev) => (prev.email ? prev : { ...prev, email: res.user!.email }));
      setEmailDialogOpen(false);
      toast.success('Üyelik maili güncellendi');
    } catch (error) {
      console.error(error);
      toast.error('Üyelik maili güncellenemedi');
    } finally {
      setEmailSaving(false);
    }
  };

  const savePassword = async () => {
    if (newPassword.length < 4) {
      toast.error('Şifre en az 4 karakter olmalı');
      return;
    }
    if (newPassword !== newPasswordAgain) {
      toast.error('Şifreler eşleşmiyor');
      return;
    }
    if (!user) {
      toast.error('Aktif kullanıcı bulunamadı');
      return;
    }

    setPasswordSaving(true);
    try {
      const res = await dbActions.updateUserPassword({
        email: user.email,
        newPassword,
        companyName: settings.companyName || user.companyName,
      });
      if (!res.success || !res.user) {
        toast.error(typeof res.error === 'string' ? res.error : 'Şifre güncellenemedi');
        return;
      }
      login(res.user);
      setNewPassword('');
      setNewPasswordAgain('');
      setPasswordDialogOpen(false);
      toast.success('Şifre güncellendi');
    } catch (error) {
      console.error(error);
      toast.error('Şifre güncellenemedi');
    } finally {
      setPasswordSaving(false);
    }
  };

  return (
    <div className="space-y-6 animate-enter">
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <Settings className="w-7 h-7 text-sky-400" />
          Ayarlar
        </h1>
        <p className="text-zinc-500">Şirket bilgileri ve üyelik ayarları</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="w-5 h-5 text-zinc-300" />
            Şirket Bilgileri (Cari Ekstrede Kullanılır)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {loading ? (
            <div className="text-sm text-zinc-500">Ayarlar yükleniyor...</div>
          ) : (
            <>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm text-zinc-300 font-medium">Şirket İsmi</label>
                  <Input
                    value={settings.companyName}
                    onChange={(e) => setSettings((prev) => ({ ...prev, companyName: e.target.value }))}
                    placeholder="Örn: URUNX Yazılım"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm text-zinc-300 font-medium">Ticari Ünvan</label>
                  <Input
                    value={settings.tradeName}
                    onChange={(e) => setSettings((prev) => ({ ...prev, tradeName: e.target.value }))}
                    placeholder="Örn: URUNX Yazılım ve Ticaret A.Ş."
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm text-zinc-300 font-medium">Telefon / İletişim</label>
                  <Input
                    value={settings.phone}
                    onChange={(e) => setSettings((prev) => ({ ...prev, phone: e.target.value }))}
                    placeholder="Örn: +90 532 000 00 00"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm text-zinc-300 font-medium">E-Posta</label>
                  <Input
                    type="email"
                    value={settings.email}
                    onChange={(e) => setSettings((prev) => ({ ...prev, email: e.target.value }))}
                    placeholder="Örn: info@sirket.com"
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm text-zinc-300 font-medium">Aylık Faiz Maliyeti (%)</label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={settings.stockInterestMonthlyRate ?? 0}
                    onChange={(e) => setSettings((prev) => ({ ...prev, stockInterestMonthlyRate: Number(e.target.value) || 0 }))}
                    placeholder="Örn: 4.50"
                  />
                  <p className="text-xs text-zinc-500">Büyük Stok Maliyeti raporunda stok bekleme maliyeti bu oranla hesaplanır.</p>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm text-zinc-300 font-medium">Adres</label>
                <textarea
                  value={settings.address}
                  onChange={(e) => setSettings((prev) => ({ ...prev, address: e.target.value }))}
                  placeholder="Şirket adresini yazın..."
                  className="w-full min-h-[100px] rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ring-offset-zinc-950"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm text-zinc-300 font-medium">Logo</label>
                <div className="flex flex-col md:flex-row gap-4 md:items-center">
                  <label className="inline-flex items-center gap-2 cursor-pointer px-3 py-2 rounded-md border border-zinc-700 hover:bg-zinc-900 text-sm">
                    <Upload className="w-4 h-4" />
                    Logo Yükle
                    <input type="file" accept="image/*" className="hidden" onChange={onLogoFile} />
                  </label>
                  <Input
                    value={logoInputValue}
                    onChange={(e) => setSettings((prev) => ({ ...prev, logo: e.target.value }))}
                    placeholder={isEmbeddedLogo ? 'Yerel logo yüklü (base64 gizlendi)' : 'İsterseniz logo URL girin'}
                  />
                </div>
                {settings.logo ? (
                  <div className="mt-2 w-28 h-28 rounded-md border border-zinc-800 bg-white flex items-center justify-center overflow-hidden">
                    <img src={settings.logo} alt="Şirket logosu" className="max-w-full max-h-full object-contain" />
                  </div>
                ) : null}
              </div>

              <div className="flex justify-end">
                <Button className="bg-sky-600 hover:bg-sky-700 text-white gap-2" onClick={saveSettings} disabled={saving}>
                  <Save className="w-4 h-4" />
                  Kaydet
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Üyelik Ayarları</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col md:flex-row gap-3">
          <Button variant="outline" className="border-zinc-700 gap-2" onClick={() => setEmailDialogOpen(true)}>
            <Mail className="w-4 h-4" />
            Üyelik Maili Değiştir
          </Button>
          <Button variant="outline" className="border-zinc-700 gap-2" onClick={() => setPasswordDialogOpen(true)}>
            <KeyRound className="w-4 h-4" />
            Şifre Değiştir
          </Button>
        </CardContent>
      </Card>

      <Dialog open={emailDialogOpen} onOpenChange={setEmailDialogOpen}>
        <DialogContent className="sm:max-w-md border-zinc-800">
          <DialogHeader>
            <DialogTitle>Üyelik Maili Değiştir</DialogTitle>
            <DialogDescription>Yeni üyelik e-posta adresinizi girin.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <label className="text-sm text-zinc-300 font-medium">E-Posta</label>
            <Input
              type="email"
              value={newMembershipEmail}
              onChange={(e) => setNewMembershipEmail(e.target.value)}
              placeholder="ornek@sirket.com"
            />
          </div>
          <DialogFooter>
	          <Button variant="outline" className="border-zinc-700" disabled={emailSaving} onClick={() => setEmailDialogOpen(false)}>
	              Vazgeç
	            </Button>
	            <Button className="bg-sky-600 hover:bg-sky-700 text-white disabled:opacity-60" disabled={emailSaving} onClick={saveMembershipEmail}>
	              {emailSaving ? 'Kaydediliyor...' : 'Kaydet'}
	            </Button>
	          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={passwordDialogOpen} onOpenChange={setPasswordDialogOpen}>
        <DialogContent className="sm:max-w-md border-zinc-800">
          <DialogHeader>
            <DialogTitle>Şifre Değiştir</DialogTitle>
            <DialogDescription>Yeni şifrenizi belirleyin.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <label className="text-sm text-zinc-300 font-medium">Yeni Şifre</label>
              <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
            </div>
            <div className="space-y-2">
              <label className="text-sm text-zinc-300 font-medium">Yeni Şifre (Tekrar)</label>
              <Input type="password" value={newPasswordAgain} onChange={(e) => setNewPasswordAgain(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
	            <Button variant="outline" className="border-zinc-700" disabled={passwordSaving} onClick={() => setPasswordDialogOpen(false)}>
	              Vazgeç
	            </Button>
	            <Button className="bg-sky-600 hover:bg-sky-700 text-white disabled:opacity-60" disabled={passwordSaving} onClick={savePassword}>
	              {passwordSaving ? 'Kaydediliyor...' : 'Kaydet'}
	            </Button>
	          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
