/*
 * EdTechRAG chatbot embed (block_chatbot) - standalone widget, no Moodle required.
 *
 * This file must stay ASCII-only: static .js is served without a charset, so a classic
 * <script src> inherits the encoding of the host page. Write non-ASCII text as \uXXXX escapes.
 * Check with: LC_ALL=C grep -n '[^ -~\t]' edtechrag.js   (must print nothing)
 */
(function () {
  'use strict';

  var P = 'at-ed-tech-edtechrag-emd-';

  /* -- User-terms consent -- */
  var USERTERMS_DEFAULT_MONTHS = 12;
  var USERTERMS_MIN_MONTHS = 1;
  var USERTERMS_MAX_MONTHS = 60;
  // Fixed 30-day months, matching src/lib/ragContext.ts. Calendar math is timezone/DST dependent
  // and would make client and server disagree at the expiry boundary.
  var MONTH_MS = 30 * 24 * 60 * 60 * 1000;

  var TEXT = {
    en: {
      close: 'Close',
      faqLabel: 'Possible Questions:',
      clearChat: 'Clear chat',
      placeholder: 'Write a message ...',
      send: 'Send',
      open: 'open',
      errorPrefix: 'Error:',
      termsIntro: 'Please read and accept the terms of use before using the chat.',
      termsLinkLabel: 'Terms of use',
      termsAccept: 'Accept',
      menu: 'More options',
      revokeQuestion: 'Revoke your consent to the terms of use? The chat will be locked again.',
      revoke: 'Revoke',
      cancel: 'Cancel'
    },
    de: {
      close: 'Schlie\u00dfen',
      faqLabel: 'M\u00f6gliche Fragen:',
      clearChat: 'Chat leeren',
      placeholder: 'Nachricht schreiben ...',
      send: 'Senden',
      open: '\u00f6ffnen',
      errorPrefix: 'Fehler:',
      termsIntro: 'Bitte lesen und akzeptieren Sie die Benutzerbedingungen, um den Chat zu nutzen.',
      termsLinkLabel: 'Benutzerbedingungen',
      termsAccept: 'Akzeptieren',
      menu: 'Weitere Optionen',
      revokeQuestion: 'Zustimmung zu den Benutzerbedingungen widerrufen? Der Chat wird danach wieder gesperrt.',
      revoke: 'Widerrufen',
      cancel: 'Abbrechen'
    },
    it: {
      close: 'Chiudi',
      faqLabel: 'Domande possibili:',
      clearChat: 'Cancella chat',
      placeholder: 'Scrivi un messaggio ...',
      send: 'Invia',
      open: 'apri',
      errorPrefix: 'Errore:',
      termsIntro: 'Leggi e accetta le condizioni d\'uso per utilizzare la chat.',
      termsLinkLabel: 'Condizioni d\'uso',
      termsAccept: 'Accetta',
      menu: 'Altre opzioni',
      revokeQuestion: 'Revocare il consenso alle condizioni d\'uso? La chat verr\u00e0 bloccata di nuovo.',
      revoke: 'Revoca',
      cancel: 'Annulla'
    },
    fr: {
      close: 'Fermer',
      faqLabel: 'Questions possibles :',
      clearChat: 'Vider le chat',
      placeholder: '\u00c9crire un message ...',
      send: 'Envoyer',
      open: 'ouvrir',
      errorPrefix: 'Erreur :',
      termsIntro: 'Veuillez lire et accepter les conditions d\'utilisation pour utiliser le chat.',
      termsLinkLabel: 'Conditions d\'utilisation',
      termsAccept: 'Accepter',
      menu: 'Plus d\'options',
      revokeQuestion: 'R\u00e9voquer votre accord aux conditions d\'utilisation ? Le chat sera de nouveau bloqu\u00e9.',
      revoke: 'R\u00e9voquer',
      cancel: 'Annuler'
    },
    pt: {
      close: 'Fechar',
      faqLabel: 'Poss\u00edveis perguntas:',
      clearChat: 'Limpar chat',
      placeholder: 'Escrever uma mensagem ...',
      send: 'Enviar',
      open: 'abrir',
      errorPrefix: 'Erro:',
      termsIntro: 'Leia e aceite os termos de uso para utilizar o chat.',
      termsLinkLabel: 'Termos de uso',
      termsAccept: 'Aceitar',
      menu: 'Mais op\u00e7\u00f5es',
      revokeQuestion: 'Revogar o consentimento aos termos de uso? O chat ser\u00e1 bloqueado novamente.',
      revoke: 'Revogar',
      cancel: 'Cancelar'
    },
    fi: {
      close: 'Sulje',
      faqLabel: 'Mahdolliset kysymykset:',
      clearChat: 'Tyhjenn\u00e4 chat',
      placeholder: 'Kirjoita viesti ...',
      send: 'L\u00e4het\u00e4',
      open: 'avaa',
      errorPrefix: 'Virhe:',
      termsIntro: 'Lue ja hyv\u00e4ksy k\u00e4ytt\u00f6ehdot, jotta voit k\u00e4ytt\u00e4\u00e4 chattia.',
      termsLinkLabel: 'K\u00e4ytt\u00f6ehdot',
      termsAccept: 'Hyv\u00e4ksy',
      menu: 'Lis\u00e4\u00e4 valintoja',
      revokeQuestion: 'Perutaanko k\u00e4ytt\u00f6ehtojen hyv\u00e4ksynt\u00e4? Chat lukitaan uudelleen.',
      revoke: 'Peru hyv\u00e4ksynt\u00e4',
      cancel: 'Peruuta'
    },
    sv: {
      close: 'St\u00e4ng',
      faqLabel: 'M\u00f6jliga fr\u00e5gor:',
      clearChat: 'Rensa chatten',
      placeholder: 'Skriv ett meddelande ...',
      send: 'Skicka',
      open: '\u00f6ppna',
      errorPrefix: 'Fel:',
      termsIntro: 'L\u00e4s och godk\u00e4nn anv\u00e4ndarvillkoren f\u00f6r att anv\u00e4nda chatten.',
      termsLinkLabel: 'Anv\u00e4ndarvillkor',
      termsAccept: 'Godk\u00e4nn',
      menu: 'Fler alternativ',
      revokeQuestion: '\u00c5terkalla ditt godk\u00e4nnande av anv\u00e4ndarvillkoren? Chatten l\u00e5ses igen.',
      revoke: '\u00c5terkalla',
      cancel: 'Avbryt'
    },
    id: {
      close: 'Tutup',
      faqLabel: 'Pertanyaan yang mungkin:',
      clearChat: 'Hapus obrolan',
      placeholder: 'Tulis pesan ...',
      send: 'Kirim',
      open: 'buka',
      errorPrefix: 'Kesalahan:',
      termsIntro: 'Silakan baca dan setujui ketentuan penggunaan untuk menggunakan obrolan.',
      termsLinkLabel: 'Ketentuan penggunaan',
      termsAccept: 'Setuju',
      menu: 'Opsi lainnya',
      revokeQuestion: 'Cabut persetujuan Anda atas ketentuan penggunaan? Obrolan akan diblokir kembali.',
      revoke: 'Cabut',
      cancel: 'Batal'
    },
    hu: {
      close: 'Bez\u00e1r',
      faqLabel: 'Lehets\u00e9ges k\u00e9rd\u00e9sek:',
      clearChat: 'Chat t\u00f6rl\u00e9se',
      placeholder: '\u00dczenet \u00edr\u00e1sa ...',
      send: 'K\u00fcld\u00e9s',
      open: 'megnyit',
      errorPrefix: 'Hiba:',
      termsIntro: 'K\u00e9rj\u00fck, olvassa el \u00e9s fogadja el a haszn\u00e1lati felt\u00e9teleket a chat haszn\u00e1lat\u00e1hoz.',
      termsLinkLabel: 'Haszn\u00e1lati felt\u00e9telek',
      termsAccept: 'Elfogadom',
      menu: 'Tov\u00e1bbi lehet\u0151s\u00e9gek',
      revokeQuestion: 'Visszavonja a haszn\u00e1lati felt\u00e9telek elfogad\u00e1s\u00e1t? A chat ism\u00e9t z\u00e1rolva lesz.',
      revoke: 'Visszavon\u00e1s',
      cancel: 'M\u00e9gse'
    },
    bs: {
      close: 'Zatvori',
      faqLabel: 'Mogu\u0107a pitanja:',
      clearChat: 'O\u010disti chat',
      placeholder: 'Napi\u0161ite poruku ...',
      send: 'Po\u0161alji',
      open: 'otvori',
      errorPrefix: 'Gre\u0161ka:',
      termsIntro: 'Pro\u010ditajte i prihvatite uslove kori\u0161tenja da biste koristili chat.',
      termsLinkLabel: 'Uslovi kori\u0161tenja',
      termsAccept: 'Prihvatam',
      menu: 'Vi\u0161e opcija',
      revokeQuestion: 'Povu\u0107i pristanak na uslove kori\u0161tenja? Chat \u0107e ponovo biti blokiran.',
      revoke: 'Povuci',
      cancel: 'Otka\u017ei'
    },
    ca: {
      close: 'Tanca',
      faqLabel: 'Preguntes possibles:',
      clearChat: 'Esborra el xat',
      placeholder: 'Escriu un missatge ...',
      send: 'Envia',
      open: 'obre',
      errorPrefix: 'Error:',
      termsIntro: 'Llegiu i accepteu les condicions d\'\u00fas per utilitzar el xat.',
      termsLinkLabel: 'Condicions d\'\u00fas',
      termsAccept: 'Accepto',
      menu: 'M\u00e9s opcions',
      revokeQuestion: 'Voleu revocar el consentiment de les condicions d\'\u00fas? El xat es tornar\u00e0 a blocar.',
      revoke: 'Revoca',
      cancel: 'Cancel\u00b7la'
    },
    cs: {
      close: 'Zav\u0159\u00edt',
      faqLabel: 'Mo\u017en\u00e9 ot\u00e1zky:',
      clearChat: 'Vymazat chat',
      placeholder: 'Napi\u0161te zpr\u00e1vu ...',
      send: 'Odeslat',
      open: 'otev\u0159\u00edt',
      errorPrefix: 'Chyba:',
      termsIntro: 'P\u0159e\u010dt\u011bte si a p\u0159ijm\u011bte podm\u00ednky pou\u017eit\u00ed, abyste mohli chat pou\u017e\u00edvat.',
      termsLinkLabel: 'Podm\u00ednky pou\u017eit\u00ed',
      termsAccept: 'P\u0159ij\u00edm\u00e1m',
      menu: 'Dal\u0161\u00ed mo\u017enosti',
      revokeQuestion: 'Odvolat souhlas s podm\u00ednkami pou\u017eit\u00ed? Chat bude znovu uzam\u010den.',
      revoke: 'Odvolat',
      cancel: 'Zru\u0161it'
    },
    et: {
      close: 'Sulge',
      faqLabel: 'V\u00f5imalikud k\u00fcsimused:',
      clearChat: 'T\u00fchjenda vestlus',
      placeholder: 'Kirjuta s\u00f5num ...',
      send: 'Saada',
      open: 'ava',
      errorPrefix: 'Viga:',
      termsIntro: 'Palun lugege ja n\u00f5ustuge kasutustingimustega, et vestlust kasutada.',
      termsLinkLabel: 'Kasutustingimused',
      termsAccept: 'N\u00f5ustun',
      menu: 'Rohkem valikuid',
      revokeQuestion: 'Kas v\u00f5tta kasutustingimustega n\u00f5ustumine tagasi? Vestlus lukustatakse uuesti.',
      revoke: 'V\u00f5ta tagasi',
      cancel: 'Loobu'
    },
    es: {
      close: 'Cerrar',
      faqLabel: 'Preguntas posibles:',
      clearChat: 'Borrar chat',
      placeholder: 'Escribe un mensaje ...',
      send: 'Enviar',
      open: 'abrir',
      errorPrefix: 'Error:',
      termsIntro: 'Lea y acepte las condiciones de uso para utilizar el chat.',
      termsLinkLabel: 'Condiciones de uso',
      termsAccept: 'Acepto',
      menu: 'M\u00e1s opciones',
      revokeQuestion: '\u00bfRevocar su consentimiento a las condiciones de uso? El chat se bloquear\u00e1 de nuevo.',
      revoke: 'Revocar',
      cancel: 'Cancelar'
    },
    hr: {
      close: 'Zatvori',
      faqLabel: 'Mogu\u0107a pitanja:',
      clearChat: 'O\u010disti razgovor',
      placeholder: 'Napi\u0161ite poruku ...',
      send: 'Po\u0161alji',
      open: 'otvori',
      errorPrefix: 'Gre\u0161ka:',
      termsIntro: 'Pro\u010ditajte i prihvatite uvjete kori\u0161tenja kako biste koristili razgovor.',
      termsLinkLabel: 'Uvjeti kori\u0161tenja',
      termsAccept: 'Prihva\u0107am',
      menu: 'Vi\u0161e opcija',
      revokeQuestion: 'Povu\u0107i pristanak na uvjete kori\u0161tenja? Razgovor \u0107e ponovno biti blokiran.',
      revoke: 'Povuci',
      cancel: 'Odustani'
    },
    nl: {
      close: 'Sluiten',
      faqLabel: 'Mogelijke vragen:',
      clearChat: 'Chat wissen',
      placeholder: 'Schrijf een bericht ...',
      send: 'Versturen',
      open: 'openen',
      errorPrefix: 'Fout:',
      termsIntro: 'Lees en accepteer de gebruiksvoorwaarden om de chat te gebruiken.',
      termsLinkLabel: 'Gebruiksvoorwaarden',
      termsAccept: 'Accepteren',
      menu: 'Meer opties',
      revokeQuestion: 'Uw toestemming voor de gebruiksvoorwaarden intrekken? De chat wordt weer vergrendeld.',
      revoke: 'Intrekken',
      cancel: 'Annuleren'
    },
    no: {
      close: 'Lukk',
      faqLabel: 'Mulige sp\u00f8rsm\u00e5l:',
      clearChat: 'T\u00f8m chat',
      placeholder: 'Skriv en melding ...',
      send: 'Send',
      open: '\u00e5pne',
      errorPrefix: 'Feil:',
      termsIntro: 'Les og godta bruksvilk\u00e5rene for \u00e5 bruke chatten.',
      termsLinkLabel: 'Bruksvilk\u00e5r',
      termsAccept: 'Godta',
      menu: 'Flere valg',
      revokeQuestion: 'Trekke tilbake samtykket til bruksvilk\u00e5rene? Chatten blir l\u00e5st igjen.',
      revoke: 'Trekk tilbake',
      cancel: 'Avbryt'
    },
    pl: {
      close: 'Zamknij',
      faqLabel: 'Mo\u017cliwe pytania:',
      clearChat: 'Wyczy\u015b\u0107 czat',
      placeholder: 'Napisz wiadomo\u015b\u0107 ...',
      send: 'Wy\u015blij',
      open: 'otw\u00f3rz',
      errorPrefix: 'B\u0142\u0105d:',
      termsIntro: 'Przeczytaj i zaakceptuj warunki korzystania, aby korzysta\u0107 z czatu.',
      termsLinkLabel: 'Warunki korzystania',
      termsAccept: 'Akceptuj\u0119',
      menu: 'Wi\u0119cej opcji',
      revokeQuestion: 'Wycofa\u0107 zgod\u0119 na warunki korzystania? Czat zostanie ponownie zablokowany.',
      revoke: 'Wycofaj',
      cancel: 'Anuluj'
    },
    sk: {
      close: 'Zavrie\u0165',
      faqLabel: 'Mo\u017en\u00e9 ot\u00e1zky:',
      clearChat: 'Vymaza\u0165 chat',
      placeholder: 'Nap\u00ed\u0161te spr\u00e1vu ...',
      send: 'Odosla\u0165',
      open: 'otvori\u0165',
      errorPrefix: 'Chyba:',
      termsIntro: 'Pre\u010d\u00edtajte si a prijmite podmienky pou\u017e\u00edvania, aby ste mohli chat pou\u017e\u00edva\u0165.',
      termsLinkLabel: 'Podmienky pou\u017e\u00edvania',
      termsAccept: 'Prij\u00edmam',
      menu: '\u010eal\u0161ie mo\u017enosti',
      revokeQuestion: 'Odvola\u0165 s\u00fahlas s podmienkami pou\u017e\u00edvania? Chat bude znova uzamknut\u00fd.',
      revoke: 'Odvola\u0165',
      cancel: 'Zru\u0161i\u0165'
    },
    sl: {
      close: 'Zapri',
      faqLabel: 'Mo\u017ena vpra\u0161anja:',
      clearChat: 'Po\u010disti klepet',
      placeholder: 'Napi\u0161ite sporo\u010dilo ...',
      send: 'Po\u0161lji',
      open: 'odpri',
      errorPrefix: 'Napaka:',
      termsIntro: 'Preberite in sprejmite pogoje uporabe, da lahko uporabljate klepet.',
      termsLinkLabel: 'Pogoji uporabe',
      termsAccept: 'Sprejemam',
      menu: 'Ve\u010d mo\u017enosti',
      revokeQuestion: 'Ali \u017eelite umakniti soglasje s pogoji uporabe? Klepet bo znova zaklenjen.',
      revoke: 'Umakni soglasje',
      cancel: 'Prekli\u010di'
    },
    tr: {
      close: 'Kapat',
      faqLabel: 'Olas\u0131 sorular:',
      clearChat: 'Sohbeti temizle',
      placeholder: 'Mesaj yaz ...',
      send: 'G\u00f6nder',
      open: 'a\u00e7',
      errorPrefix: 'Hata:',
      termsIntro: 'Sohbeti kullanmak i\u00e7in kullan\u0131m ko\u015fullar\u0131n\u0131 okuyup kabul edin.',
      termsLinkLabel: 'Kullan\u0131m ko\u015fullar\u0131',
      termsAccept: 'Kabul ediyorum',
      menu: 'Di\u011fer se\u00e7enekler',
      revokeQuestion: 'Kullan\u0131m ko\u015fullar\u0131na verdi\u011finiz onay\u0131 geri almak istiyor musunuz? Sohbet yeniden kilitlenecek.',
      revoke: 'Geri al',
      cancel: '\u0130ptal'
    },
    el: {
      close: '\u039a\u03bb\u03b5\u03af\u03c3\u03b9\u03bc\u03bf',
      faqLabel: '\u03a0\u03b9\u03b8\u03b1\u03bd\u03ad\u03c2 \u03b5\u03c1\u03c9\u03c4\u03ae\u03c3\u03b5\u03b9\u03c2:',
      clearChat: '\u0395\u03ba\u03ba\u03b1\u03b8\u03ac\u03c1\u03b9\u03c3\u03b7 \u03c3\u03c5\u03bd\u03bf\u03bc\u03b9\u03bb\u03af\u03b1\u03c2',
      placeholder: '\u0393\u03c1\u03ac\u03c8\u03c4\u03b5 \u03ad\u03bd\u03b1 \u03bc\u03ae\u03bd\u03c5\u03bc\u03b1 ...',
      send: '\u0391\u03c0\u03bf\u03c3\u03c4\u03bf\u03bb\u03ae',
      open: '\u03ac\u03bd\u03bf\u03b9\u03b3\u03bc\u03b1',
      errorPrefix: '\u03a3\u03c6\u03ac\u03bb\u03bc\u03b1:',
      termsIntro: '\u0394\u03b9\u03b1\u03b2\u03ac\u03c3\u03c4\u03b5 \u03ba\u03b1\u03b9 \u03b1\u03c0\u03bf\u03b4\u03b5\u03c7\u03c4\u03b5\u03af\u03c4\u03b5 \u03c4\u03bf\u03c5\u03c2 \u03cc\u03c1\u03bf\u03c5\u03c2 \u03c7\u03c1\u03ae\u03c3\u03b7\u03c2 \u03b3\u03b9\u03b1 \u03bd\u03b1 \u03c7\u03c1\u03b7\u03c3\u03b9\u03bc\u03bf\u03c0\u03bf\u03b9\u03ae\u03c3\u03b5\u03c4\u03b5 \u03c4\u03b7 \u03c3\u03c5\u03bd\u03bf\u03bc\u03b9\u03bb\u03af\u03b1.',
      termsLinkLabel: '\u038c\u03c1\u03bf\u03b9 \u03c7\u03c1\u03ae\u03c3\u03b7\u03c2',
      termsAccept: '\u0391\u03c0\u03bf\u03b4\u03ad\u03c7\u03bf\u03bc\u03b1\u03b9',
      menu: '\u03a0\u03b5\u03c1\u03b9\u03c3\u03c3\u03cc\u03c4\u03b5\u03c1\u03b5\u03c2 \u03b5\u03c0\u03b9\u03bb\u03bf\u03b3\u03ad\u03c2',
      revokeQuestion: '\u039d\u03b1 \u03b1\u03bd\u03b1\u03ba\u03bb\u03b7\u03b8\u03b5\u03af \u03b7 \u03c3\u03c5\u03b3\u03ba\u03b1\u03c4\u03ac\u03b8\u03b5\u03c3\u03ae \u03c3\u03b1\u03c2 \u03c3\u03c4\u03bf\u03c5\u03c2 \u03cc\u03c1\u03bf\u03c5\u03c2 \u03c7\u03c1\u03ae\u03c3\u03b7\u03c2; \u0397 \u03c3\u03c5\u03bd\u03bf\u03bc\u03b9\u03bb\u03af\u03b1 \u03b8\u03b1 \u03ba\u03bb\u03b5\u03b9\u03b4\u03c9\u03b8\u03b5\u03af \u03be\u03b1\u03bd\u03ac.',
      revoke: '\u0391\u03bd\u03ac\u03ba\u03bb\u03b7\u03c3\u03b7',
      cancel: '\u0386\u03ba\u03c5\u03c1\u03bf'
    },
    mk: {
      close: '\u0417\u0430\u0442\u0432\u043e\u0440\u0438',
      faqLabel: '\u041c\u043e\u0436\u043d\u0438 \u043f\u0440\u0430\u0448\u0430\u045a\u0430:',
      clearChat: '\u0418\u0441\u0447\u0438\u0441\u0442\u0438 \u0440\u0430\u0437\u0433\u043e\u0432\u043e\u0440',
      placeholder: '\u041d\u0430\u043f\u0438\u0448\u0435\u0442\u0435 \u043f\u043e\u0440\u0430\u043a\u0430 ...',
      send: '\u0418\u0441\u043f\u0440\u0430\u0442\u0438',
      open: '\u043e\u0442\u0432\u043e\u0440\u0438',
      errorPrefix: '\u0413\u0440\u0435\u0448\u043a\u0430:',
      termsIntro: '\u041f\u0440\u043e\u0447\u0438\u0442\u0430\u0458\u0442\u0435 \u0438 \u043f\u0440\u0438\u0444\u0430\u0442\u0435\u0442\u0435 \u0433\u0438 \u0443\u0441\u043b\u043e\u0432\u0438\u0442\u0435 \u0437\u0430 \u043a\u043e\u0440\u0438\u0441\u0442\u0435\u045a\u0435 \u0437\u0430 \u0434\u0430 \u0433\u043e \u043a\u043e\u0440\u0438\u0441\u0442\u0438\u0442\u0435 \u0440\u0430\u0437\u0433\u043e\u0432\u043e\u0440\u043e\u0442.',
      termsLinkLabel: '\u0423\u0441\u043b\u043e\u0432\u0438 \u0437\u0430 \u043a\u043e\u0440\u0438\u0441\u0442\u0435\u045a\u0435',
      termsAccept: '\u041f\u0440\u0438\u0444\u0430\u045c\u0430\u043c',
      menu: '\u041f\u043e\u0432\u0435\u045c\u0435 \u043e\u043f\u0446\u0438\u0438',
      revokeQuestion: '\u0414\u0430 \u0441\u0435 \u043e\u0434\u0437\u0435\u043c\u0435 \u0441\u043e\u0433\u043b\u0430\u0441\u043d\u043e\u0441\u0442\u0430 \u0437\u0430 \u0443\u0441\u043b\u043e\u0432\u0438\u0442\u0435 \u0437\u0430 \u043a\u043e\u0440\u0438\u0441\u0442\u0435\u045a\u0435? \u0420\u0430\u0437\u0433\u043e\u0432\u043e\u0440\u043e\u0442 \u043f\u043e\u0432\u0442\u043e\u0440\u043d\u043e \u045c\u0435 \u0431\u0438\u0434\u0435 \u0431\u043b\u043e\u043a\u0438\u0440\u0430\u043d.',
      revoke: '\u041e\u0434\u0437\u0435\u043c\u0438',
      cancel: '\u041e\u0442\u043a\u0430\u0436\u0438'
    },
    ru: {
      close: '\u0417\u0430\u043a\u0440\u044b\u0442\u044c',
      faqLabel: '\u0412\u043e\u0437\u043c\u043e\u0436\u043d\u044b\u0435 \u0432\u043e\u043f\u0440\u043e\u0441\u044b:',
      clearChat: '\u041e\u0447\u0438\u0441\u0442\u0438\u0442\u044c \u0447\u0430\u0442',
      placeholder: '\u041d\u0430\u043f\u0438\u0441\u0430\u0442\u044c \u0441\u043e\u043e\u0431\u0449\u0435\u043d\u0438\u0435 ...',
      send: '\u041e\u0442\u043f\u0440\u0430\u0432\u0438\u0442\u044c',
      open: '\u043e\u0442\u043a\u0440\u044b\u0442\u044c',
      errorPrefix: '\u041e\u0448\u0438\u0431\u043a\u0430:',
      termsIntro: '\u041f\u043e\u0436\u0430\u043b\u0443\u0439\u0441\u0442\u0430, \u043f\u0440\u043e\u0447\u0438\u0442\u0430\u0439\u0442\u0435 \u0438 \u043f\u0440\u0438\u043c\u0438\u0442\u0435 \u0443\u0441\u043b\u043e\u0432\u0438\u044f \u0438\u0441\u043f\u043e\u043b\u044c\u0437\u043e\u0432\u0430\u043d\u0438\u044f, \u0447\u0442\u043e\u0431\u044b \u043f\u043e\u043b\u044c\u0437\u043e\u0432\u0430\u0442\u044c\u0441\u044f \u0447\u0430\u0442\u043e\u043c.',
      termsLinkLabel: '\u0423\u0441\u043b\u043e\u0432\u0438\u044f \u0438\u0441\u043f\u043e\u043b\u044c\u0437\u043e\u0432\u0430\u043d\u0438\u044f',
      termsAccept: '\u041f\u0440\u0438\u043d\u0438\u043c\u0430\u044e',
      menu: '\u0414\u0440\u0443\u0433\u0438\u0435 \u043f\u0430\u0440\u0430\u043c\u0435\u0442\u0440\u044b',
      revokeQuestion: '\u041e\u0442\u043e\u0437\u0432\u0430\u0442\u044c \u0441\u043e\u0433\u043b\u0430\u0441\u0438\u0435 \u0441 \u0443\u0441\u043b\u043e\u0432\u0438\u044f\u043c\u0438 \u0438\u0441\u043f\u043e\u043b\u044c\u0437\u043e\u0432\u0430\u043d\u0438\u044f? \u0427\u0430\u0442 \u0441\u043d\u043e\u0432\u0430 \u0431\u0443\u0434\u0435\u0442 \u0437\u0430\u0431\u043b\u043e\u043a\u0438\u0440\u043e\u0432\u0430\u043d.',
      revoke: '\u041e\u0442\u043e\u0437\u0432\u0430\u0442\u044c',
      cancel: '\u041e\u0442\u043c\u0435\u043d\u0430'
    },
    uk: {
      close: '\u0417\u0430\u043a\u0440\u0438\u0442\u0438',
      faqLabel: '\u041c\u043e\u0436\u043b\u0438\u0432\u0456 \u0437\u0430\u043f\u0438\u0442\u0430\u043d\u043d\u044f:',
      clearChat: '\u041e\u0447\u0438\u0441\u0442\u0438\u0442\u0438 \u0447\u0430\u0442',
      placeholder: '\u041d\u0430\u043f\u0438\u0441\u0430\u0442\u0438 \u043f\u043e\u0432\u0456\u0434\u043e\u043c\u043b\u0435\u043d\u043d\u044f ...',
      send: '\u041d\u0430\u0434\u0456\u0441\u043b\u0430\u0442\u0438',
      open: '\u0432\u0456\u0434\u043a\u0440\u0438\u0442\u0438',
      errorPrefix: '\u041f\u043e\u043c\u0438\u043b\u043a\u0430:',
      termsIntro: '\u041f\u0440\u043e\u0447\u0438\u0442\u0430\u0439\u0442\u0435 \u0442\u0430 \u043f\u0440\u0438\u0439\u043c\u0456\u0442\u044c \u0443\u043c\u043e\u0432\u0438 \u043a\u043e\u0440\u0438\u0441\u0442\u0443\u0432\u0430\u043d\u043d\u044f, \u0449\u043e\u0431 \u043a\u043e\u0440\u0438\u0441\u0442\u0443\u0432\u0430\u0442\u0438\u0441\u044f \u0447\u0430\u0442\u043e\u043c.',
      termsLinkLabel: '\u0423\u043c\u043e\u0432\u0438 \u043a\u043e\u0440\u0438\u0441\u0442\u0443\u0432\u0430\u043d\u043d\u044f',
      termsAccept: '\u041f\u0440\u0438\u0439\u043c\u0430\u044e',
      menu: '\u0406\u043d\u0448\u0456 \u043f\u0430\u0440\u0430\u043c\u0435\u0442\u0440\u0438',
      revokeQuestion: '\u0412\u0456\u0434\u043a\u043b\u0438\u043a\u0430\u0442\u0438 \u0437\u0433\u043e\u0434\u0443 \u0437 \u0443\u043c\u043e\u0432\u0430\u043c\u0438 \u043a\u043e\u0440\u0438\u0441\u0442\u0443\u0432\u0430\u043d\u043d\u044f? \u0427\u0430\u0442 \u0437\u043d\u043e\u0432\u0443 \u0431\u0443\u0434\u0435 \u0437\u0430\u0431\u043b\u043e\u043a\u043e\u0432\u0430\u043d\u043e.',
      revoke: '\u0412\u0456\u0434\u043a\u043b\u0438\u043a\u0430\u0442\u0438',
      cancel: '\u0421\u043a\u0430\u0441\u0443\u0432\u0430\u0442\u0438'
    },
    he: {
      close: '\u05e1\u05d2\u05d5\u05e8',
      faqLabel: '\u05e9\u05d0\u05dc\u05d5\u05ea \u05d0\u05e4\u05e9\u05e8\u05d9\u05d5\u05ea:',
      clearChat: '\u05e0\u05e7\u05d4 \u05e9\u05d9\u05d7\u05d4',
      placeholder: '\u05db\u05ea\u05d5\u05d1 \u05d4\u05d5\u05d3\u05e2\u05d4 ...',
      send: '\u05e9\u05dc\u05d7',
      open: '\u05e4\u05ea\u05d7',
      errorPrefix: '\u05e9\u05d2\u05d9\u05d0\u05d4:',
      termsIntro: '\u05d0\u05e0\u05d0 \u05e7\u05e8\u05d0\u05d5 \u05d5\u05d0\u05e9\u05e8\u05d5 \u05d0\u05ea \u05ea\u05e0\u05d0\u05d9 \u05d4\u05e9\u05d9\u05de\u05d5\u05e9 \u05db\u05d3\u05d9 \u05dc\u05d4\u05e9\u05ea\u05de\u05e9 \u05d1\u05e6\'\u05d0\u05d8.',
      termsLinkLabel: '\u05ea\u05e0\u05d0\u05d9 \u05e9\u05d9\u05de\u05d5\u05e9',
      termsAccept: '\u05d0\u05e0\u05d9 \u05de\u05d0\u05e9\u05e8',
      menu: '\u05d0\u05e4\u05e9\u05e8\u05d5\u05d9\u05d5\u05ea \u05e0\u05d5\u05e1\u05e4\u05d5\u05ea',
      revokeQuestion: '\u05dc\u05d1\u05d8\u05dc \u05d0\u05ea \u05d4\u05d4\u05e1\u05db\u05de\u05d4 \u05dc\u05ea\u05e0\u05d0\u05d9 \u05d4\u05e9\u05d9\u05de\u05d5\u05e9? \u05d4\u05e6\'\u05d0\u05d8 \u05d9\u05d9\u05d7\u05e1\u05dd \u05e9\u05d5\u05d1.',
      revoke: '\u05d1\u05d8\u05dc \u05d4\u05e1\u05db\u05de\u05d4',
      cancel: '\u05e1\u05d2\u05d5\u05e8'
    },
    ar: {
      close: '\u0625\u063a\u0644\u0627\u0642',
      faqLabel: '\u0623\u0633\u0626\u0644\u0629 \u0645\u062d\u062a\u0645\u0644\u0629:',
      clearChat: '\u0645\u0633\u062d \u0627\u0644\u0645\u062d\u0627\u062f\u062b\u0629',
      placeholder: '\u0627\u0643\u062a\u0628 \u0631\u0633\u0627\u0644\u0629 ...',
      send: '\u0625\u0631\u0633\u0627\u0644',
      open: '\u0641\u062a\u062d',
      errorPrefix: '\u062e\u0637\u0623:',
      termsIntro: '\u064a\u0631\u062c\u0649 \u0642\u0631\u0627\u0621\u0629 \u0634\u0631\u0648\u0637 \u0627\u0644\u0627\u0633\u062a\u062e\u062f\u0627\u0645 \u0648\u0627\u0644\u0645\u0648\u0627\u0641\u0642\u0629 \u0639\u0644\u064a\u0647\u0627 \u0644\u0627\u0633\u062a\u062e\u062f\u0627\u0645 \u0627\u0644\u0645\u062d\u0627\u062f\u062b\u0629.',
      termsLinkLabel: '\u0634\u0631\u0648\u0637 \u0627\u0644\u0627\u0633\u062a\u062e\u062f\u0627\u0645',
      termsAccept: '\u0623\u0648\u0627\u0641\u0642',
      menu: '\u062e\u064a\u0627\u0631\u0627\u062a \u0623\u062e\u0631\u0649',
      revokeQuestion: '\u0647\u0644 \u062a\u0631\u064a\u062f \u0633\u062d\u0628 \u0645\u0648\u0627\u0641\u0642\u062a\u0643 \u0639\u0644\u0649 \u0634\u0631\u0648\u0637 \u0627\u0644\u0627\u0633\u062a\u062e\u062f\u0627\u0645\u061f \u0633\u064a\u062a\u0645 \u0642\u0641\u0644 \u0627\u0644\u0645\u062d\u0627\u062f\u062b\u0629 \u0645\u0631\u0629 \u0623\u062e\u0631\u0649.',
      revoke: '\u0633\u062d\u0628 \u0627\u0644\u0645\u0648\u0627\u0641\u0642\u0629',
      cancel: '\u0625\u0644\u063a\u0627\u0621'
    }
  };

  function cn(name) { return P + name; }
  function el(tag, classes, attrs) {
    var e = document.createElement(tag);
    if (classes) e.className = classes;
    if (attrs) Object.keys(attrs).forEach(function (k) { e.setAttribute(k, attrs[k]); });
    return e;
  }

  function loadMarked(baseUrl, cb) {
    if (window.marked) { cb(); return; }
    var s = document.createElement('script');
    s.src = baseUrl + 'cdn/marked.umd.js';
    s.onload = cb;
    s.onerror = cb; // proceed without markdown if load fails
    document.head.appendChild(s);
  }

  function renderMarkdown(text) {
    if (window.marked) {
      try {
        var html = window.marked.parse(text);
        // open all links in new tab
        return html.replace(/<a\s/gi, '<a target="_blank" rel="noopener noreferrer" ');
      } catch (e) { /* fall through */ }
    }
    return escapeHtml(text).replace(/\n/g, '<br>');
  }

  function escapeHtml(s) {
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  function parseDefaultMessages(raw) {
    if (!raw || raw === 'f') return [];
    try { return JSON.parse(raw); } catch (e) { /* fall through */ }
    // try pipe-separated fallback
    return raw.split('|').map(function (s) { return s.trim(); }).filter(Boolean);
  }

  function resolveLang(raw) {
    if (raw && TEXT[raw]) return raw;
    return 'en';
  }

  // The terms URL comes from the host page and ends up in an href, so only http(s) is accepted.
  // A malformed value is treated as "no terms configured" instead of locking the widget forever.
  function normalizeTermsUrl(raw) {
    if (!raw) return '';
    try {
      var u = new URL(raw, window.location.href);
      if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error('unsupported scheme');
      return u.href;
    } catch (e) {
      if (window.console && window.console.warn) {
        window.console.warn('[edtechrag] ignoring invalid data-userterms-url:', raw);
      }
      return '';
    }
  }

  function parseDurationMonths(raw) {
    var months = parseInt(raw, 10);
    if (!isFinite(months)) return USERTERMS_DEFAULT_MONTHS;
    return Math.min(Math.max(months, USERTERMS_MIN_MONTHS), USERTERMS_MAX_MONTHS);
  }

  function initWidget(configDiv) {
    var d = configDiv.dataset;
    var embedId      = d.embedId      || '';
    var username     = d.username     || '';
    var greeting     = d.greeting     || '';
    var assistantName = d.assistantName || 'Chatbot';
    var assistantIcon = d.assistantIcon || '';
    var brandImageUrl = d.brandImageUrl || '';
    var sponsorLink  = d.sponsorLink  || '';
    var sponsorText  = d.sponsorText  || '';
    var defaultMessages = parseDefaultMessages(d.defaultMessages);
    var baseUrl      = d.edtechragBaseUrl || '/edtechrag/';
    if (!baseUrl.endsWith('/')) baseUrl += '/';

    // Presence of a valid terms URL is the on-switch for the consent gate.
    var usertermsUrl = normalizeTermsUrl(d.usertermsUrl);
    var usertermsMonths = parseDurationMonths(d.usertermsDuration);

    var lang = resolveLang(d.lang);
    var T = TEXT[lang];
    var design = d.design || 'tugraz';

    var messages = [];
    var loading  = false;
    var gated    = false;
    var historyRendered = false;
    var decoder  = new TextDecoder();
    var storageKey = 'edtechrag-chat-' + embedId;
    // Separate key, so "clear chat" cannot revoke the consent.
    var termsKey = 'edtechrag-userterms-' + embedId;
    var acceptedAt = null;
    var acceptedUrl = null;

    var SEARCH_START = '__EDTECH_SEARCH_START__\n';
    var SEARCH_END = '\n__EDTECH_SEARCH_END__\n';
    var SEARCH_ICON = String.fromCodePoint(0x1F50D); // magnifier emoji, built at runtime to keep this file ASCII-only

    function saveHistory() {
      try {
        localStorage.setItem(storageKey, JSON.stringify(messages));
      } catch (e) { /* storage quota or private mode */ }
    }

    function loadHistory() {
      try {
        var raw = localStorage.getItem(storageKey);
        if (!raw) return;
        var saved = JSON.parse(raw);
        if (!Array.isArray(saved) || !saved.length) return;
        messages = saved;
        return true;
      } catch (e) { return false; }
    }

    /* -- User-terms consent -- */
    function loadAcceptance() {
      try {
        var raw = localStorage.getItem(termsKey);
        if (!raw) return;
        var rec = JSON.parse(raw);
        // JSON.parse happily returns null, numbers and arrays; only trust the expected shape.
        if (!rec || typeof rec !== 'object' || Array.isArray(rec)) return;
        if (typeof rec.acceptedAt !== 'string' || typeof rec.url !== 'string') return;
        acceptedAt = rec.acceptedAt;
        acceptedUrl = rec.url;
      } catch (e) { /* storage disabled, private mode or junk */ }
    }

    function saveAcceptance() {
      try {
        localStorage.setItem(
          termsKey,
          JSON.stringify({ acceptedAt: acceptedAt, url: acceptedUrl, months: usertermsMonths })
        );
      } catch (e) { /* storage quota or private mode */ }
    }

    function clearAcceptance() {
      acceptedAt = null;
      acceptedUrl = null;
      try { localStorage.removeItem(termsKey); } catch (e) { /* */ }
    }

    function termsValid() {
      if (!usertermsUrl) return true;
      // A changed URL means a new version of the terms, so consent has to be given again.
      if (!acceptedAt || acceptedUrl !== usertermsUrl) return false;
      var parsed = Date.parse(acceptedAt);
      if (!isFinite(parsed)) return false;
      var now = Date.now();
      // A stamp from the future means the clock was wrong; ask again rather than block forever.
      if (parsed > now) return false;
      return now - parsed < usertermsMonths * MONTH_MS;
    }

    function acceptTerms() {
      // Set the in-memory value first and independently of persistence: in private mode setItem
      // throws, and the visitor should still be able to chat for this session.
      acceptedAt = new Date().toISOString();
      acceptedUrl = usertermsUrl;
      saveAcceptance();
      hideGate();
      renderSavedHistory();
      textarea.focus();
    }

    /* -- Build DOM -- */
    var host = el('div', cn('host'));
    if (design !== 'tugraz') {
      host.classList.add(cn('design-' + design));
    }

    /* Panel */
    var panel = el('div', cn('panel'));
    panel.setAttribute('hidden', 'hidden');

    /* Header */
    var header = el('div', cn('header'));

    var avatar;
    if (brandImageUrl) {
      avatar = el('img', cn('avatar'), { src: brandImageUrl, alt: assistantName });
    } else {
      avatar = el('div', cn('avatar'));
      avatar.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 36.2 32.86"><path d="M36.2 0H0v22.93h23.38l-1.77 9.94 12-9.94h2.59zm-3.42 20.63-7.8 6.46 1.15-6.46H2.3V2.3h31.6v18.33zm-21.6-8.7c0 .89-.72 1.61-1.61 1.61s-1.61-.72-1.61-1.61.72-1.61 1.61-1.61 1.61.72 1.61 1.61m17.06 0c0 .89-.72 1.61-1.61 1.61s-1.61-.72-1.61-1.61.72-1.61 1.61-1.61 1.61.72 1.61 1.61M21.4 13c0 1.46-1.47 2.65-3.27 2.65s-3.27-1.19-3.27-2.65c0-.33.27-.6.6-.6s.6.27.6.6c0 .78.95 1.45 2.07 1.45s2.07-.66 2.07-1.45c0-.33.27-.6.6-.6s.6.27.6.6"/></svg>';
    }

    var titleEl = el('span', cn('title'));
    titleEl.textContent = assistantName;

    var closeBtn = el('button', cn('close'));
    closeBtn.setAttribute('aria-label', T.close);
    closeBtn.innerHTML = '&#x2715;';

    header.appendChild(avatar);
    header.appendChild(titleEl);
    header.appendChild(closeBtn);

    /* Messages */
    var messagesEl = el('div', cn('messages'));

    if (greeting) {
      var greetingEl = el('div', cn('greeting'));
      greetingEl.textContent = greeting;
      messagesEl.appendChild(greetingEl);
    }

    var faqSection = null;
    var faqLabelEl = null;
    if (defaultMessages.length > 0) {
      faqLabelEl = el('div', cn('faq-label'));
      faqLabelEl.textContent = T.faqLabel;
      messagesEl.appendChild(faqLabelEl);

      faqSection = el('div', cn('faq'));
      defaultMessages.forEach(function (msg) {
        var pill = el('button', cn('faq-pill'));
        pill.textContent = msg;
        pill.addEventListener('click', function () { send(msg); });
        faqSection.appendChild(pill);
      });
      messagesEl.appendChild(faqSection);
    }

    /* User-terms gate: shown instead of the composer until the terms are accepted */
    var gateEl = null;
    var gateAcceptBtn = null;
    if (usertermsUrl) {
      gateEl = el('div', cn('gate'));
      gateEl.setAttribute('hidden', 'hidden');

      var gateTextEl = el('div', cn('gate-text'));
      gateTextEl.textContent = T.termsIntro;

      var gateLink = el('a', cn('gate-link'), {
        href: usertermsUrl,
        target: '_blank',
        rel: 'noopener noreferrer'
      });
      gateLink.textContent = T.termsLinkLabel;

      var gateActions = el('div', cn('gate-actions'));
      var gateCloseBtn = el('button', cn('gate-btn'));
      gateCloseBtn.textContent = T.close;
      gateAcceptBtn = el('button', cn('gate-btn') + ' ' + cn('gate-btn-accept'));
      gateAcceptBtn.textContent = T.termsAccept;
      gateActions.appendChild(gateCloseBtn);
      gateActions.appendChild(gateAcceptBtn);

      gateEl.appendChild(gateTextEl);
      gateEl.appendChild(gateLink);
      gateEl.appendChild(gateActions);
      messagesEl.appendChild(gateEl);

      gateCloseBtn.addEventListener('click', function () { setOpen(false); });
      gateAcceptBtn.addEventListener('click', function () { acceptTerms(); });
    }

    /* Footer: sponsor, terms link and the three-dots menu on the left, clear button on the right */
    var footerEl = el('div', cn('footer'));
    var footerLeft = el('div', cn('footer-left'));
    footerEl.appendChild(footerLeft);

    if (sponsorLink && sponsorText) {
      var sponsorA = el('a', cn('sponsor-link'), { href: sponsorLink, target: '_blank', rel: 'noopener noreferrer' });
      sponsorA.textContent = sponsorText;
      footerLeft.appendChild(sponsorA);
      footerEl.classList.add(cn('has-sponsor'));
    }

    /* Terms link plus the three-dots menu that opens the revoke dialog */
    var menuBtn = null;
    if (usertermsUrl) {
      var footerTermsLink = el('a', cn('sponsor-link'), {
        href: usertermsUrl,
        target: '_blank',
        rel: 'noopener noreferrer'
      });
      footerTermsLink.textContent = T.termsLinkLabel;
      footerLeft.appendChild(footerTermsLink);

      menuBtn = el('button', cn('menu-btn'), {
        'aria-label': T.menu,
        'aria-haspopup': 'dialog',
        title: T.menu
      });
      menuBtn.innerHTML = '&#x22EE;';
      footerLeft.appendChild(menuBtn);
      footerEl.classList.add(cn('has-sponsor'));
    }

    var clearBtn = el('button', cn('clear-btn'));
    clearBtn.textContent = T.clearChat;
    footerEl.appendChild(clearBtn);

    /* Composer */
    var composer  = el('div', cn('composer'));
    var textarea  = el('textarea', cn('input'), { rows: '1', placeholder: T.placeholder });
    var sendBtn   = el('button', cn('send'));
    sendBtn.setAttribute('aria-label', T.send);
    sendBtn.innerHTML = '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>';

    composer.appendChild(textarea);
    composer.appendChild(sendBtn);

    panel.appendChild(header);
    panel.appendChild(messagesEl);
    panel.appendChild(footerEl);
    panel.appendChild(composer);

    /* Revoke-consent modal, layered over the whole panel */
    var modalEl = null;
    var modalCancelBtn = null;
    if (usertermsUrl) {
      modalEl = el('div', cn('modal'), { role: 'dialog', 'aria-modal': 'true' });
      modalEl.setAttribute('hidden', 'hidden');

      var modalBox = el('div', cn('modal-box'));

      var modalTextEl = el('div', cn('modal-text'));
      modalTextEl.textContent = T.revokeQuestion;

      var modalActions = el('div', cn('modal-actions'));
      modalCancelBtn = el('button', cn('gate-btn'));
      modalCancelBtn.textContent = T.cancel;
      var modalRevokeBtn = el('button', cn('gate-btn') + ' ' + cn('gate-btn-danger'));
      modalRevokeBtn.textContent = T.revoke;
      modalActions.appendChild(modalCancelBtn);
      modalActions.appendChild(modalRevokeBtn);

      modalBox.appendChild(modalTextEl);
      modalBox.appendChild(modalActions);
      modalEl.appendChild(modalBox);
      panel.appendChild(modalEl);

      modalCancelBtn.addEventListener('click', function () { setModalOpen(false); });
      modalRevokeBtn.addEventListener('click', function () { revokeTerms(); });
      // Clicking the backdrop (but not the dialog box) closes without revoking.
      modalEl.addEventListener('click', function (e) {
        if (e.target === modalEl) setModalOpen(false);
      });
      modalEl.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') {
          e.preventDefault();
          setModalOpen(false);
        }
      });
    }

    /* FAB */
    var fab = el('button', cn('fab'));
    fab.setAttribute('aria-label', assistantName + ' ' + T.open);

    if (assistantIcon) {
      var fabImg = el('img', '', { src: assistantIcon, alt: assistantName });
      fab.appendChild(fabImg);
    } else {
      fab.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 36.2 32.86"><path d="M36.2 0H0v22.93h23.38l-1.77 9.94 12-9.94h2.59zm-3.42 20.63-7.8 6.46 1.15-6.46H2.3V2.3h31.6v18.33zm-21.6-8.7c0 .89-.72 1.61-1.61 1.61s-1.61-.72-1.61-1.61.72-1.61 1.61-1.61 1.61.72 1.61 1.61m17.06 0c0 .89-.72 1.61-1.61 1.61s-1.61-.72-1.61-1.61.72-1.61 1.61-1.61 1.61.72 1.61 1.61M21.4 13c0 1.46-1.47 2.65-3.27 2.65s-3.27-1.19-3.27-2.65c0-.33.27-.6.6-.6s.6.27.6.6c0 .78.95 1.45 2.07 1.45s2.07-.66 2.07-1.45c0-.33.27-.6.6-.6s.6.27.6.6"/></svg>';
    }

    host.appendChild(panel);
    host.appendChild(fab);
    document.body.appendChild(host);

    /* -- History restore -- */
    function renderSavedHistory() {
      if (historyRendered) return;
      historyRendered = true;
      var hadHistory = loadHistory();
      if (!hadHistory) return;
      // hide FAQ since there's an existing conversation
      setHidden(faqSection, true);
      setHidden(faqLabelEl, true);
      messages.forEach(function (m) {
        if (m.role === 'search') {
          messagesEl.appendChild(buildSearchBubble(m.queries));
          return;
        }
        var wrap = el('div', cn('bubble') + ' ' + cn(m.role));
        var content = el('div', cn('bubble-content'));
        if (m.role === 'user') {
          content.textContent = m.content;
        } else {
          content.innerHTML = renderMarkdown(m.content);
        }
        wrap.appendChild(content);
        messagesEl.appendChild(wrap);
      });
    }

    function clearHistory() {
      try { localStorage.removeItem(storageKey); } catch (e) { /* */ }
      messages = [];
      // remove all bubble elements
      var bubbles = messagesEl.querySelectorAll('.' + cn('bubble'));
      bubbles.forEach(function (b) { b.remove(); });
      // restore FAQ
      setHidden(faqSection, false);
      setHidden(faqLabelEl, false);
    }

    /* -- State helpers -- */
    function setHidden(node, hidden) {
      if (node) node.style.display = hidden ? 'none' : '';
    }

    function showGate() {
      if (!gateEl) return;
      gated = true;
      setHidden(greetingEl, true);
      setHidden(faqLabelEl, true);
      setHidden(faqSection, true);
      setHidden(footerEl, true);
      setHidden(composer, true);
      // Re-appending moves the gate below an existing transcript, which is what a mid-session
      // expiry or 403 needs; on a first open it is the only visible child anyway.
      messagesEl.appendChild(gateEl);
      gateEl.removeAttribute('hidden');
      scrollBottom();
    }

    function hideGate() {
      gated = false;
      if (gateEl) gateEl.setAttribute('hidden', 'hidden');
      setHidden(greetingEl, false);
      setHidden(footerEl, false);
      setHidden(composer, false);
      // Keep the FAQ pills hidden when a conversation is already going on.
      var hasConversation = messages.length > 0;
      setHidden(faqLabelEl, hasConversation);
      setHidden(faqSection, hasConversation);
    }

    function setModalOpen(open) {
      if (!modalEl) return;
      if (open) {
        modalEl.removeAttribute('hidden');
        // Focus the harmless option, not the destructive one.
        modalCancelBtn.focus();
      } else {
        modalEl.setAttribute('hidden', 'hidden');
        if (menuBtn) menuBtn.focus();
      }
    }

    function revokeTerms() {
      clearAcceptance();
      setModalOpen(false);
      // The transcript stays; it is hidden again on the next page load until the terms are
      // accepted anew (same rule as a first visit).
      showGate();
    }

    function setOpen(open) {
      if (open) {
        panel.removeAttribute('hidden');
        panel.classList.add(cn('open'));
        // The composer is hidden while gated, so focusing it would go nowhere.
        if (gated && gateAcceptBtn) gateAcceptBtn.focus();
        else textarea.focus();
        scrollBottom();
      } else {
        // Don't leave the dialog open behind a closed panel.
        if (modalEl) modalEl.setAttribute('hidden', 'hidden');
        panel.setAttribute('hidden', 'hidden');
        panel.classList.remove(cn('open'));
      }
    }

    function scrollBottom() {
      messagesEl.scrollTo({ top: messagesEl.scrollHeight, behavior: 'smooth' });
    }

    function addBubble(role, htmlContent) {
      var wrap = el('div', cn('bubble') + ' ' + cn(role));
      var content = el('div', cn('bubble-content'));
      if (role === 'user') {
        content.textContent = htmlContent;
      } else {
        content.innerHTML = htmlContent;
      }
      wrap.appendChild(content);
      messagesEl.appendChild(wrap);
      scrollBottom();
      return content;
    }

    function buildSearchBubble(queries) {
      var wrap = el('div', cn('bubble') + ' ' + cn('search'));
      (queries || []).forEach(function (q) {
        if (typeof q !== 'string' || !q) return;
        var chip = el('span', cn('search-chip'));
        chip.textContent = SEARCH_ICON + ' ' + q;
        wrap.appendChild(chip);
      });
      return wrap;
    }

    /* -- Send -- */
    function send(raw) {
      if (gated) return;
      // Consent may have expired while the panel was open; ask again before hitting the network.
      if (!termsValid()) { showGate(); return; }

      var value = typeof raw === 'string' ? raw.trim() : textarea.value.trim();
      if (!value || loading) return;

      textarea.value = '';
      textarea.style.height = '';

      setHidden(faqSection, true);
      setHidden(faqLabelEl, true);

      loading = true;
      sendBtn.disabled = true;

      var history = messages
        .filter(function (m) { return m.role === 'user' || m.role === 'assistant'; })
        .map(function (m) { return { role: m.role, content: m.content }; });
      messages.push({ role: 'user', content: value });
      addBubble('user', value);

      var assistantRaw = '';
      messages.push({ role: 'assistant', content: '' });
      var assistantIndex = messages.length - 1;
      var assistantContentEl = addBubble('assistant', '<span class="' + cn('muted') + '">...</span>');

      var buffer = '';
      var searchDone = false;

      function handleSearchBlock() {
        // Returns true if it consumed/awaited the search block, false if none present.
        if (searchDone) return false;
        if (buffer.indexOf(SEARCH_START) === 0) {
          var endIdx = buffer.indexOf(SEARCH_END);
          if (endIdx === -1) return true; // wait for more data
          var payload = buffer.slice(SEARCH_START.length, endIdx);
          var queries = [];
          try {
            var parsed = JSON.parse(payload);
            if (Array.isArray(parsed)) {
              queries = parsed.filter(function (q) { return typeof q === 'string'; });
            }
          } catch (e) { /* ignore malformed payload */ }
          // Insert the chip bubble just before the assistant bubble and persist it.
          var assistantWrap = assistantContentEl.parentNode;
          messagesEl.insertBefore(buildSearchBubble(queries), assistantWrap);
          messages.splice(assistantIndex, 0, { role: 'search', queries: queries });
          assistantIndex += 1;
          buffer = buffer.slice(endIdx + SEARCH_END.length);
          searchDone = true;
          return false;
        }
        if (buffer.length > 0 && SEARCH_START.indexOf(buffer) === 0) {
          return true; // buffer is still a prefix of the marker; wait for more
        }
        searchDone = true; // no search block present
        return false;
      }

      function dropPendingTurn() {
        // Remove the placeholder answer and the question it belongs to, so the failed turn is not
        // replayed as history on the next attempt.
        var assistantWrap = assistantContentEl.parentNode;
        var userWrap = assistantWrap ? assistantWrap.previousElementSibling : null;
        if (assistantWrap) assistantWrap.remove();
        if (userWrap) userWrap.remove();
        messages.splice(assistantIndex - 1, 2);
        loading = false;
        sendBtn.disabled = false;
      }

      var url = baseUrl + 'api/embed/' + encodeURIComponent(embedId);
      fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: value,
          history: history,
          username: username,
          source: window.location.href,
          usertermsUrl: usertermsUrl || undefined,
          termsAcceptedAt: acceptedAt || undefined,
          usertermsDuration: usertermsUrl ? usertermsMonths : undefined
        })
      }).then(function (res) {
        if (res.status === 403) {
          return res.text().then(function (body) {
            // Without a gate (no data-userterms-url) there is nothing the visitor could accept, so
            // fall through to the error bubble instead of dropping the message silently.
            if (gateEl && body && body.indexOf('userterms-required') !== -1) {
              // The server rejected our stored acceptance: ask again, keep the transcript and give
              // the question back to the visitor so it can be resent after accepting.
              clearAcceptance();
              dropPendingTurn();
              textarea.value = value;
              showGate();
              return;
            }
            throw new Error('Request failed (403)');
          });
        }
        if (!res.ok || !res.body) throw new Error('Request failed (' + res.status + ')');
        var reader = res.body.getReader();

        function read() {
          return reader.read().then(function (chunk) {
            if (chunk.done) {
              loading = false;
              sendBtn.disabled = false;
              saveHistory();
              return;
            }
            var piece = decoder.decode(chunk.value || new Uint8Array(), { stream: true });
            buffer += piece;
            // Peel off the optional search-query block before treating bytes as tokens.
            if (handleSearchBlock()) return read();
            if (buffer) { assistantRaw += buffer; buffer = ''; }
            messages[assistantIndex].content = assistantRaw;
            assistantContentEl.innerHTML = renderMarkdown(assistantRaw);
            scrollBottom();
            return read();
          });
        }

        return read();
      }).catch(function (err) {
        assistantContentEl.innerHTML = '<span class="' + cn('muted') + '">' + T.errorPrefix + ' ' + escapeHtml(err.message) + '</span>';
        messages.pop();
        loading = false;
        sendBtn.disabled = false;
      });
    }

    /* -- Init: consent first, saved history only once the terms are accepted -- */
    loadAcceptance();
    if (!termsValid()) {
      showGate();
    } else {
      renderSavedHistory();
    }

    /* -- Events -- */
    fab.addEventListener('click', function () {
      // A tab left open for weeks must re-ask instead of sending a stale acceptance.
      if (!gated && !termsValid()) showGate();
      setOpen(true);
    });
    closeBtn.addEventListener('click', function () { setOpen(false); });
    sendBtn.addEventListener('click', function () { send(); });
    clearBtn.addEventListener('click', function () { clearHistory(); });
    if (menuBtn) menuBtn.addEventListener('click', function () { setModalOpen(true); });

    textarea.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        send();
      }
    });

    textarea.addEventListener('input', function () {
      textarea.style.height = 'auto';
      textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
    });
  }

  function initAll() {
    var divs = document.querySelectorAll('.at-ed-tech-edtechrag');
    if (!divs.length) return;
    var baseUrl = divs[0].dataset.edtechragBaseUrl || '/edtechrag/';
    if (!baseUrl.endsWith('/')) baseUrl += '/';

    loadMarked(baseUrl, function () {
      divs.forEach(function (div) { initWidget(div); });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAll);
  } else {
    initAll();
  }
})();
