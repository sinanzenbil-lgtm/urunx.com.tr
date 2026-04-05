'use client';

import { useCallback, useEffect, useState } from 'react';
import { useStockStore } from '@/lib/store';
import { ALL_MENU_KEYS, CompanySettings, type MenuRouteKey, MENU_ROUTE_OPTIONS, type MemberPublic } from '@/types';
import * as dbActions from '@/lib/actions';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Building2, KeyRound, Loader2, Mail, Save, Settings, Trash2, Upload, UserPlus } from 'lucide-react';

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
  const canManageMembers = !user?.menuRoutes?.length || user.menuRoutes.includes('ayarlar');

  const [settings, setSettings] = useState<CompanySettings>(EMPTY_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [members, setMembers] = useState<MemberPublic[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [newMemberOpen, setNewMemberOpen] = useState(false);
  const [nmFirst, setNmFirst] = useState('');
  const [nmLast, setNmLast] = useState('');
  const [nmUser, setNmUser] = useState('');
  const [nmPass, setNmPass] = useState('');
  const [nmMenus, setNmMenus] = useState<MenuRouteKey[]>(() => [...ALL_MENU_KEYS]);
  const [nmPerakende, setNmPerakende] = useState(true);
  const [nmToptan, setNmToptan] = useState(true);
  const [nmSaving, setNmSaving] = useState(false);

  const [emailDialogOpen, setEmailDialogOpen] = useState(false);
  const [newMembershipEmail, setNewMembershipEmail] = useState(user?.email || '');

  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [newPasswordAgain, setNewPasswordAgain] = useState('');
  const [passwordSaving, setPasswordSaving] = useState(false);
  const isEmbeddedLogo = (settings.logo || '').startsWith('data:image');
  const logoInputValue = isEmbeddedLogo ? '' : (settings.logo || '');

  const loadMembers = useCallback(async () => {
    setLoadingMembers(true);
    try {
      const res = await dbActions.listMembers();
      if (res.success) setMembers(res.members);
      else toast.error('Üye listesi yüklenemedi');
    } finally {
      setLoadingMembers(false);
    }
  }, []);

  useEffect(() => {
    if (canManageMembers) void loadMembers();
  }, [canManageMembers, loadMembers]);

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
      toast.success('Ayarlar kaydedildi', { id: toastId });
    } catch (error) {
      console.error(error);
      toast.error('Ayarlar kaydedilemedi', { id: toastId });
    } finally {
      setSaving(false);
    }
  };

  const saveMembershipEmail = () => {
    const email = newMembershipEmail.trim();
    if (!email || !email.includes('@')) {
      toast.error('Geçerli bir e-posta girin');
      return;
    }
    if (!user) {
      toast.error('Aktif kullanıcı bulunamadı');
      return;
    }
    login({ ...user, email });
    setSettings((prev) => ({ ...prev, email: prev.email || email }));
    setEmailDialogOpen(false);
    toast.success('Üyelik maili güncellendi');
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
      if (user.id) {
        const res = await dbActions.updateMemberPassword(user.id, newPassword);
        if (!res.success) {
          toast.error('Şifre güncellenemedi');
          return;
        }
      } else {
        localStorage.setItem('urunx-account-password', newPassword);
      }
      setNewPassword('');
      setNewPasswordAgain('');
      setPasswordDialogOpen(false);
      toast.success('Şifre güncellendi');
    } finally {
      setPasswordSaving(false);
    }
  };

  const toggleNmMenu = (key: MenuRouteKey) => {
    setNmMenus((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  };

  const resetNewMemberForm = () => {
    setNmFirst('');
    setNmLast('');
    setNmUser('');
    setNmPass('');
    setNmMenus([...ALL_MENU_KEYS]);
    setNmPerakende(true);
    setNmToptan(true);
  };

  const submitNewMember = async () => {
    if (!nmFirst.trim() || !nmLast.trim()) {
      toast.error('Ad ve soyad zorunludur');
      return;
    }
    if (!nmUser.trim()) {
      toast.error('Üye adı zorunludur');
      return;
    }
    if (nmPass.length < 4) {
      toast.error('Şifre en az 4 karakter olmalı');
      return;
    }
    if (nmMenus.length === 0) {
      toast.error('En az bir menü seçin');
      return;
    }
    if (!nmPerakende && !nmToptan) {
      toast.error('Satış için Perakende veya Toptan seçin');
      return;
    }
    setNmSaving(true);
    try {
      const res = await dbActions.createMember({
        firstName: nmFirst.trim(),
        lastName: nmLast.trim(),
        username: nmUser.trim(),
        password: nmPass,
        menuRoutes: nmMenus,
        salesPerakende: nmPerakende,
        salesToptan: nmToptan,
      });
      if (!res.success) {
        if (res.error === 'duplicate') toast.error('Bu üye adı zaten kullanılıyor');
        else toast.error('Üye oluşturulamadı');
        return;
      }
      toast.success('Yeni üye oluşturuldu');
      setNewMemberOpen(false);
      resetNewMemberForm();
      await loadMembers();
    } finally {
      setNmSaving(false);
    }
  };

  const removeMember = async (m: MemberPublic) => {
    if (!window.confirm(`${m.username} kullanıcısını silmek istediğinize emin misiniz?`)) return;
    const res = await dbActions.deleteMember(m.id, user?.id);
    if (!res.success) {
      if (res.error === 'self') toast.error('Kendi hesabınızı silemezsiniz');
      else if (res.error === 'last') toast.error('Son kullanıcı silinemez');
      else toast.error('Silinemedi');
      return;
    }
    toast.success('Üye silindi');
    await loadMembers();
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

      {canManageMembers ? (
        <Card>
          <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between space-y-0">
            <CardTitle>Üyelik Yönet</CardTitle>
            <Button
              className="bg-sky-600 hover:bg-sky-700 text-white gap-2 w-fit"
              onClick={() => {
                resetNewMemberForm();
                setNewMemberOpen(true);
              }}
            >
              <UserPlus className="w-4 h-4" />
              Yeni üye
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            {loadingMembers ? (
              <div className="flex items-center gap-2 text-sm text-zinc-500">
                <Loader2 className="w-4 h-4 animate-spin" />
                Üyeler yükleniyor…
              </div>
            ) : members.length === 0 ? (
              <p className="text-sm text-zinc-500">Kayıtlı üye yok.</p>
            ) : (
              <div className="overflow-x-auto rounded-md border border-zinc-800">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-zinc-800 bg-zinc-900/50 text-left text-zinc-400">
                      <th className="p-3 font-medium">Ad Soyad</th>
                      <th className="p-3 font-medium">Üye adı</th>
                      <th className="p-3 font-medium hidden lg:table-cell">Menüler</th>
                      <th className="p-3 font-medium">Satış</th>
                      <th className="p-3 font-medium w-24" />
                    </tr>
                  </thead>
                  <tbody>
                    {members.map((m) => (
                      <tr key={m.id} className="border-b border-zinc-800/80 last:border-0">
                        <td className="p-3 text-white">
                          {m.firstName} {m.lastName}
                        </td>
                        <td className="p-3 font-mono text-zinc-300">{m.username}</td>
                        <td className="p-3 text-zinc-500 hidden lg:table-cell max-w-md">
                          {MENU_ROUTE_OPTIONS.filter((o) => m.menuRoutes.includes(o.key))
                            .map((o) => o.label)
                            .join(', ')}
                        </td>
                        <td className="p-3 text-zinc-400 text-xs">
                          {[m.salesPerakende && 'Perakende', m.salesToptan && 'Toptan'].filter(Boolean).join(' / ') ||
                            '—'}
                        </td>
                        <td className="p-3">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="text-red-400 hover:text-red-300 hover:bg-red-950/40"
                            onClick={() => void removeMember(m)}
                            title="Sil"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="text-xs text-zinc-500">
              Yeni üyeye atanacak menüler, üst menüde göreceği ekranları belirler. Satış ekranında yalnızca işaretlenen
              kanallar (Perakende / Toptan) kullanılabilir.
            </p>
          </CardContent>
        </Card>
      ) : null}

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
            <Button variant="outline" className="border-zinc-700" onClick={() => setEmailDialogOpen(false)}>
              Vazgeç
            </Button>
            <Button className="bg-sky-600 hover:bg-sky-700 text-white" onClick={saveMembershipEmail}>
              Kaydet
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
            <Button variant="outline" className="border-zinc-700" onClick={() => setPasswordDialogOpen(false)}>
              Vazgeç
            </Button>
            <Button
              className="bg-sky-600 hover:bg-sky-700 text-white"
              onClick={() => void savePassword()}
              disabled={passwordSaving}
            >
              {passwordSaving ? 'Kaydediliyor…' : 'Kaydet'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={newMemberOpen}
        onOpenChange={(o) => {
          setNewMemberOpen(o);
          if (!o) resetNewMemberForm();
        }}
      >
        <DialogContent className="sm:max-w-lg border-zinc-800 max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Yeni üye</DialogTitle>
            <DialogDescription>Ad, soyad, üye adı, şifre ve erişebileceği menüleri belirleyin.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm text-zinc-300 font-medium">Ad</label>
                <Input value={nmFirst} onChange={(e) => setNmFirst(e.target.value)} placeholder="Ad" />
              </div>
              <div className="space-y-2">
                <label className="text-sm text-zinc-300 font-medium">Soyad</label>
                <Input value={nmLast} onChange={(e) => setNmLast(e.target.value)} placeholder="Soyad" />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm text-zinc-300 font-medium">Üye adı (giriş)</label>
              <Input
                value={nmUser}
                onChange={(e) => setNmUser(e.target.value)}
                placeholder="Kullanıcı adı"
                autoComplete="off"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm text-zinc-300 font-medium">Şifre</label>
              <Input
                type="password"
                value={nmPass}
                onChange={(e) => setNmPass(e.target.value)}
                placeholder="En az 4 karakter"
                autoComplete="new-password"
              />
            </div>
            <div className="space-y-2">
              <div className="text-sm text-zinc-300 font-medium">Menü yetkileri</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 rounded-md border border-zinc-800 bg-zinc-950/80 p-3">
                {MENU_ROUTE_OPTIONS.map((o) => (
                  <label key={o.key} className="flex items-center gap-2 text-sm text-zinc-400 cursor-pointer">
                    <input
                      type="checkbox"
                      className="rounded border-zinc-600 bg-zinc-950"
                      checked={nmMenus.includes(o.key)}
                      onChange={() => toggleNmMenu(o.key)}
                    />
                    {o.label}
                  </label>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <div className="text-sm text-zinc-300 font-medium">Satış ekranı</div>
              <div className="flex flex-wrap gap-4">
                <label className="flex items-center gap-2 text-sm text-zinc-400 cursor-pointer">
                  <input
                    type="checkbox"
                    className="rounded border-zinc-600 bg-zinc-950"
                    checked={nmPerakende}
                    onChange={(e) => setNmPerakende(e.target.checked)}
                  />
                  Perakende
                </label>
                <label className="flex items-center gap-2 text-sm text-zinc-400 cursor-pointer">
                  <input
                    type="checkbox"
                    className="rounded border-zinc-600 bg-zinc-950"
                    checked={nmToptan}
                    onChange={(e) => setNmToptan(e.target.checked)}
                  />
                  Toptan
                </label>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="border-zinc-700" onClick={() => setNewMemberOpen(false)}>
              Vazgeç
            </Button>
            <Button className="bg-sky-600 hover:bg-sky-700 text-white gap-2" onClick={() => void submitNewMember()} disabled={nmSaving}>
              {nmSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              Oluştur
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
