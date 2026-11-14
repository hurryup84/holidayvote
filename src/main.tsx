import { setupIonicReact } from '@ionic/react';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import '@ionic/react/css/core.css';
import '@ionic/react/css/normalize.css';
import '@ionic/react/css/structure.css';
import '@ionic/react/css/typography.css';
import '@ionic/react/css/padding.css';
import '@ionic/react/css/flex-utils.css';
import '@ionic/react/css/display.css';
import '@ionic/react/css/palettes/dark.system.css';
import './app/theme/tokens.css';
import './app/theme/global.css';
import 'leaflet/dist/leaflet.css';

import './i18n/i18n';
import { Root } from './app/Root';

setupIonicReact();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
