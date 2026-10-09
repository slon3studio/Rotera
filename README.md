# Rotera – urnik za izmensko delo

Aplikacija, s katero si ekipa sama sestavi tedenski urnik: zaposleni oddajo,
kdaj lahko delajo, vodja pa iz tega zgradi urnik, ga objavi in ureja menjave.
Namenjena je vsakemu izmenskemu delu — gostinstvu, trgovini, domovom za
starejše, skladiščem.

Deluje kot iPhone aplikacija (App Store) in kot spletna aplikacija v brskalniku
iz ene kodne baze. Android aplikacije ni — uporabniki Androida uporabljajo
spletno različico.

## Namen

Rotera zamenja urnike, ki nastajajo po Viberju, na listu papirja ali v Excelu.
Rešuje tri stvari:

- **Urnik se sestavi sam.** Zaposleni za naslednji teden označijo, kdaj lahko
  delajo in na katerem delovnem mestu. Vodja s klikom iz teh želja zgradi
  osnutek in ga nato le še popravi — namesto da bi ugibal, kdo kdaj more.
- **Menjave imajo sled.** Prošnja za menjavo, prevzem in potrditev vodje se
  zgodijo v aplikaciji, ne v klepetu. Vsakdo vidi, kdo dejansko dela.
- **Vsaka organizacija je svoja.** Podatki so ločeni na ravni baze (Row-Level
  Security), ne v kodi aplikacije. Zato lahko ista namestitev brez tveganja
  streže več podjetjem.

Vmesnik je v slovenščini.

## Funkcije

**Zaposleni**

- Oddaja želja za naslednji teden: dopoldne, popoldne, prosto ali karkoli, z
  izbiro delovnega mesta
- Urnik v živo — še preden ga vodja objavi
- Prošnja za **menjavo** (nekdo drug prevzame tvojo smeno) in predlog
  **rotacije** (dva si smeni zamenjata, oba delata)
- Lastna evidenca opravljenih ur ter urna postavka, ki jo vidi samo on
  (napitnine, če jih organizacija beleži)

**Vodja**

- Sestavljanje urnika iz oddanih želja, ročno urejanje in objava
- Kopiranje prejšnjega tedna
- Opozorila na konflikte (nekdo je na urniku, čeprav je oddal prosto)
- Odobritev ali zavrnitev menjav in rotacij
- Nastavitve urnika: katere smene organizacija dela, njihov čas, delovna mesta
  in zadolžitve (dostop samo prek Nastavitve → Organizacija, ne več s Profila)
- Upravljanje ekipe in koda za pridružitev

**Skupno**

- Svetla in temna tema ali po nastavitvi telefona
- Vgradljiva spletna različica (PWA) z ikono na domačem zaslonu
- Brisanje računa v Nastavitve → Račun (zahteva App Store, 5.1.1(v)). Če se
  izbriše zadnji aktivni vodja, se izbriše cela organizacija (migracija 0021)
- Povezavi do politike zasebnosti in podpore v Nastavitvah (slon3studio.github.io/Slon3Studio_website)

## Zagon in dostop

**V živo (spletna različica):** <https://rotera-tau.vercel.app>

Odpri povezavo na telefonu in si app namesti na domači zaslon:

- **iPhone:** odpri v **Safariju** (Chrome na iOS tega ne zna) → **Share** →
  **Add to Home Screen**
- **Android:** Chrome sam ponudi **Install app**

Nameščen se odpre brez naslovne vrstice brskalnika, tako kot običajna
aplikacija.

**App Store:** še ni objavljeno. Objava zahteva Apple Developer Program
(99 $/leto); ko bo, pride povezava sem:
`https://apps.apple.com/app/rotera/idXXXXXXXXX`

**Android:** samostojne aplikacije ni in ne bo — Android uporabniki namestijo
spletno različico (glej zgoraj).

**Lokalno:**

```bash
npm install
cp .env.example .env     # in vpiši svoja Supabase podatka
npx expo start           # skeniraj QR z Expo Go, ali pritisni i / a / w
```

Preverjanja pred objavo:

```bash
npx tsc --noEmit         # tipi
npx expo lint            # lint
npx expo-doctor          # ujemanje odvisnosti s SDK
```

## Struktura

```
src/app/                   poti (Expo Router — vsaka datoteka je zaslon)
  _layout.tsx              vrata prijave (Stack.Protected)
  login.tsx, register.tsx
  (tabs)/                  prijavljena lupina: Urnik, Želje, Menjave, Profil
  settings.tsx             ime, urna postavka, videz
  schedule-settings.tsx    smene in časi, delovna mesta, zadolžitve (vodja)
src/components/            mreže urnika, okna za smene
src/components/ui/         skupni gradniki (ikone, tab bar, okna, polja)
src/contexts/              seja in vloga, deljeni podatki, tema
src/hooks/                 en hook na področje (urnik, želje, menjave …)
src/lib/supabase.ts        edini odjemalec
src/lib/theme.ts           paleta; štiri pomenske barve so nosilne
src/types/index.ts         oblike vrstic, zrcalijo tabele v Postgresu
supabase/migrations/       shema baze — edini vir resnice
public/                    samo za splet: manifest, service worker, ikone
docs/RAZVOJ.md             tehnične opombe in razlogi za odločitve
```

V `src/app/` ne daj ničesar, kar ni zaslon — Expo Router vsako datoteko tam
obravnava kot pot.

## Tehnologije

- **Expo (React Native) in TypeScript** — ena koda za iOS in splet
- **Supabase** — Postgres, prijava in Row-Level Security
- **Vercel** — gostovanje spletne različice
- Brez lastnega strežnika: aplikacija govori neposredno s Supabase, pravila pa
  so v bazi

## Baza

Shema živi v `supabase/migrations/` in je **edini vir resnice**. Migracije se
poganjajo ročno, po vrsti, v Supabase → **SQL Editor** → prilepi → **Run**.

Dve pravili, ki držita izolacijo med organizacijami:

- vsaka tabela ima RLS politiko, vezano na `current_org_id()`
- odjemalec nikoli ne pošilja `organization_id` — tega nastavi sprožilec iz
  prijavljenega uporabnika

Podatka v `.env` sta javna po zasnovi; varuje ju RLS. **Tajni (`sb_secret_`)
ključ ne sme nikoli v aplikacijo** — `src/lib/supabase.ts` se v tem primeru
noče zagnati.

## Objava

Spletna različica se objavi sama: vsak `git push` na vejo `main` sproži gradnjo
na Vercelu. Drugega koraka ni.

```bash
git add -A && git commit -m "opis spremembe" && git push
```

Za App Store se iz iste kode zgenerira Xcode projekt. Mapa `ios/` ni v gitu
(je v `.gitignore`) — kadarkoli jo lahko na novo zgeneriraš iz `app.json`:

```bash
npx expo prebuild --platform ios --clean   # ustvari ios/Rotera.xcworkspace
open ios/Rotera.xcworkspace                # v Xcodu: Product → Archive
```

Vedno odpri `.xcworkspace`, ne `.xcodeproj`. Nastavitve (ime, bundle ID
`com.slon3studio.Rotera`, ikone) spreminjaj v `app.json`, ne v Xcodu — ob naslednjem
`prebuild --clean` se ročne spremembe v `ios/` izgubijo. Za Archive potrebuješ
Apple Developer Program (99 $/leto) in v Xcodu izbran svoj Team.

## Pogosta opravila

**Spremeni shemo baze:** dodaj novo datoteko v `supabase/migrations/` z
naslednjo zaporedno številko, poženi jo v SQL Editorju in šele nato uporabi v
kodi. Nikoli ne spreminjaj že pognane migracije — raje napiši novo.

**Dodaj zaslon:** nova datoteka v `src/app/`, nato jo vpiši v
`src/app/_layout.tsx` v pravo skupino (prijavljeni ali odjavljeni). Če zaslon
drsi, mu daj `useTabBarSpace()`, sicer ga spodaj prekrije plavajoči tab bar.

**Dodaj ikono:** v `src/components/ui/icon-set.ts` dodaj vrstico z imenom po
pomenu in ustreznicami za iOS, Android in splet.

**Spremeni barve:** `src/lib/theme.ts`. Štiri pomenske barve (poudarek,
dopoldne, popoldne, menjava) so nosilne — ne uporabi jih za kaj drugega.

**Posodobi odvisnosti:** `npx expo install --fix` jih poravna s SDK.
`npm audit fix` ne poganjaj — Expo pripne svoje različice in to jih podre.

## Kaj še ni narejeno

- **Potisna obvestila** — rabijo Apple Developer Program
- **Nočne in 12-urne smene** — zdaj sta možni le dopoldanska in popoldanska
- **Rok za oddajo želja**, izvoz urnika in pregled ur celotne ekipe za vodjo
- Nekatera sporočila o napakah iz baze še govorijo o „restavraciji"; vmesnik
  je že nevtralen

Podrobnosti in razlogi za sprejete odločitve so v [docs/RAZVOJ.md](docs/RAZVOJ.md).

## Kontakt

slon3studio@gmail.com · Ivo Peterka
