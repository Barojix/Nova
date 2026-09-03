import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.novaarena.game',
  appName: 'Starforge',
  webDir: 'dist',
  backgroundColor: '#0b0e1d',
  android: {
    allowMixedContent: true,
  },
  server: {
    // în dev pe LAN: decomentează și pune IP-ul PC-ului
    // url: 'http://192.168.1.50:5173',
    // cleartext: true,
  },
};

export default config;
