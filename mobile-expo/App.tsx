import React, { useState } from 'react';
import { SafeAreaView, StatusBar } from 'react-native';
import { LiveScoringScreen } from './src/screens/LiveScoringScreen';
import { SpeedTrackerScreen } from './src/screens/SpeedTrackerScreen';

export default function App() {
  const [screen, setScreen] = useState<'SCORER' | 'RADAR'>('SCORER');

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: screen === 'RADAR' ? '#0A0F0D' : '#F4F6F4' }}>
      <StatusBar barStyle={screen === 'RADAR' ? 'light-content' : 'dark-content'} />
      {screen === 'SCORER' ? (
        <LiveScoringScreen onOpenRadar={() => setScreen('RADAR')} />
      ) : (
        <SpeedTrackerScreen onBackToScorer={() => setScreen('SCORER')} />
      )}
    </SafeAreaView>
  );
}
