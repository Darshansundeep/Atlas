import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useConfig } from '../ConfigContext';
import { useModelAndProvider } from '../ModelAndProviderContext';
import { Button } from '../ui/button';
import AtlasProviderChooser from './AtlasProviderChooser';
import OnboardingSuccess from './OnboardingSuccess';
import { AtlasMark } from '../atlas-brand/AtlasMark';
import { HeroBackground } from '../atlas-brand/HeroBackground';
import { SignInScreen } from '../../auth/SignInScreen';
import { useAuth } from '../../auth';
import {
  trackOnboardingStarted,
  trackOnboardingCompleted,
  trackOnboardingProviderSelected,
  trackTelemetryPreference,
  setTelemetryEnabled as setAnalyticsTelemetryEnabled,
} from '../../utils/analytics';
import { defineMessages, useIntl } from '../../i18n';

const i18n = defineMessages({
  welcomeTitle: {
    id: 'onboardingGuard.welcomeTitle',
    defaultMessage: 'Welcome to Atlas', // brand-allow: react-intl defaultMessage
  },
  welcomeDescription: {
    id: 'onboardingGuard.welcomeDescription',
    defaultMessage: 'Your local AI agent. Connect an AI model provider to get started.',
  },
  checkProviderErrorTitle: {
    id: 'onboardingGuard.checkProviderErrorTitle',
    defaultMessage: 'Unable to connect to Atlas server', // brand-allow: react-intl defaultMessage
  },
  checkProviderErrorDescription: {
    id: 'onboardingGuard.checkProviderErrorDescription',
    defaultMessage: 'The server may be starting up or temporarily unavailable.',
  },
  retry: {
    id: 'onboardingGuard.retry',
    defaultMessage: 'Retry',
  },
});

const TELEMETRY_CONFIG_KEY = 'GOOSE_TELEMETRY_ENABLED';

interface OnboardingGuardProps {
  children: React.ReactNode;
}

export default function OnboardingGuard({ children }: OnboardingGuardProps) {
  const intl = useIntl();
  const navigate = useNavigate();
  const { read, upsert, getProviders } = useConfig();
  const { getFallbackModelAndProvider, refreshCurrentModelAndProvider } = useModelAndProvider();
  const auth = useAuth();

  const [isCheckingProvider, setIsCheckingProvider] = useState(true);
  const [hasProvider, setHasProvider] = useState(false);
  const [checkProviderError, setCheckProviderError] = useState(false);
  const [hasSelection, setHasSelection] = useState(false);
  /**
   * The premium welcome surface has two paths:
   *   - 'choice'  — pick Cloud sign-in vs BYOK (default for first-run)
   *   - 'byok'    — show ProviderSelector (existing BYOK flow, restyled)
   */
  const [welcomeStep, setWelcomeStep] = useState<'choice' | 'byok'>('choice');
  const [configuredProvider, setConfiguredProvider] = useState<string | null>(null);
  const [configuredProviderDisplayName, setConfiguredProviderDisplayName] = useState<string | null>(
    null
  );
  const [configuredModel, setConfiguredModel] = useState<string | null>(null);
  const hasTrackedOnboardingStart = useRef(false);

  const checkProvider = async (retries = 3, delay = 1000) => {
    setIsCheckingProvider(true);
    setCheckProviderError(false);
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const provider = (await read('GOOSE_PROVIDER', false, { throwOnError: true })) as string | null;
        if (provider?.trim()) {
          setHasProvider(true);
          setIsCheckingProvider(false);
          return;
        }

        const fallback = await getFallbackModelAndProvider();
        if (fallback.provider?.trim() && fallback.model?.trim()) {
          const configuredProvider = (await read('GOOSE_PROVIDER', false)) as string | null;
          const configuredModel = (await read('GOOSE_MODEL', false)) as string | null;
          if (configuredProvider?.trim() && configuredModel?.trim()) {
            await refreshCurrentModelAndProvider();
            setHasProvider(true);
            setIsCheckingProvider(false);
            return;
          }
        }

        setHasProvider(false);
        setIsCheckingProvider(false);
        return;
      } catch (error) {
        console.error(`Error checking provider (attempt ${attempt + 1}/${retries + 1}):`, error);
        if (attempt < retries) {
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }
    setCheckProviderError(true);
    setIsCheckingProvider(false);
  };

  useEffect(() => {
    checkProvider();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!isCheckingProvider && !hasProvider && !checkProviderError && !hasTrackedOnboardingStart.current) {
      trackOnboardingStarted();
      hasTrackedOnboardingStart.current = true;
    }
  }, [isCheckingProvider, hasProvider, checkProviderError]);

  const handleConfigured = async (providerName: string, modelId?: string) => {
    trackOnboardingProviderSelected({ provider: providerName });
    await upsert('GOOSE_PROVIDER', providerName, false);
    const providers = await getProviders(true);
    const matchedProvider = providers.find((p) => p.name === providerName);
    if (modelId) {
      await upsert('GOOSE_MODEL', modelId, false);
      setConfiguredModel(modelId);
    } else if (matchedProvider) {
      await upsert('GOOSE_MODEL', matchedProvider.metadata.default_model, false);
      setConfiguredModel(matchedProvider.metadata.default_model);
    }
    await refreshCurrentModelAndProvider();
    setConfiguredProvider(providerName);
    setConfiguredProviderDisplayName(matchedProvider?.metadata.display_name || providerName);
  };

  const finishOnboarding = async (telemetryEnabled: boolean) => {
    try {
      await upsert(TELEMETRY_CONFIG_KEY, telemetryEnabled, false);
    } catch (error) {
      console.error('Failed to save telemetry preference:', error);
    }
    trackTelemetryPreference(telemetryEnabled, 'onboarding');
    if (configuredProvider) {
      trackOnboardingCompleted(configuredProvider, configuredModel ?? undefined);
    }
    if (!telemetryEnabled) {
      setAnalyticsTelemetryEnabled(false);
    }
    navigate('/', { replace: true });
    setHasProvider(true);
  };

  if (isCheckingProvider) {
    return null;
  }

  if (checkProviderError) {
    return (
      <HeroBackground intense className="min-h-screen">
        <div className="flex items-center justify-center w-full min-h-screen p-6">
          <div
            className="text-center max-w-md w-full rounded-2xl p-8"
            style={{
              backgroundColor: 'rgba(255, 255, 255, 0.96)',
              boxShadow: 'var(--shadow-lg)',
              backdropFilter: 'blur(12px)',
            }}
          >
            <div className="flex justify-center mb-4">
              <AtlasMark size={40} />
            </div>
            <h1
              style={{
                fontSize: '1.5rem',
                fontWeight: 600,
                letterSpacing: '-0.02em',
                color: 'var(--atlas-brand-ink)',
                marginBottom: '0.75rem',
              }}
            >
              {intl.formatMessage(i18n.checkProviderErrorTitle)}
            </h1>
            <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
              {intl.formatMessage(i18n.checkProviderErrorDescription)}
            </p>
            <Button onClick={() => checkProvider()}>
              {intl.formatMessage(i18n.retry)}
            </Button>
          </div>
        </div>
      </HeroBackground>
    );
  }

  if (hasProvider) {
    return <>{children}</>;
  }

  if (configuredProviderDisplayName) {
    return (
      <OnboardingSuccess providerName={configuredProviderDisplayName} onFinish={finishOnboarding} />
    );
  }

  // First-run / signed-out / no-provider — premium hero choice screen.
  if (welcomeStep === 'choice' && !auth.user) {
    return <SignInScreen onContinueBYOK={() => setWelcomeStep('byok')} />;
  }

  // BYOK provider setup — keep the existing ProviderSelector but wrap it
  // in the premium chrome so first-run still feels like one designed flow.
  return (
    <HeroBackground intense={false} className="min-h-screen">
      <div className="h-screen w-full overflow-y-auto">
        <div
          className={`flex flex-col items-center p-6 pb-8 transition-all duration-500 ease-in-out ${
            hasSelection ? 'pt-10' : 'pt-[12vh]'
          }`}
        >
          <div className="max-w-2xl w-full mx-auto">
            <div
              className={`transition-all duration-500 ease-in-out overflow-hidden ${
                hasSelection ? 'max-h-0 opacity-0 mb-0' : 'max-h-80 opacity-100 mb-8'
              }`}
            >
              <div className="flex items-center gap-3 mb-5">
                <AtlasMark size={36} />
                <span
                  style={{
                    fontWeight: 600,
                    fontSize: '0.9rem',
                    color: 'var(--color-text-secondary)',
                  }}
                >
                  Connect a provider
                </span>
              </div>
              <h1
                style={{
                  fontSize: '2.25rem',
                  fontWeight: 600,
                  letterSpacing: '-0.025em',
                  color: 'var(--atlas-brand-ink)',
                  lineHeight: 1.1,
                  marginBottom: '0.75rem',
                }}
              >
                {intl.formatMessage(i18n.welcomeTitle)}
              </h1>
              <p
                style={{
                  fontSize: '1rem',
                  color: 'var(--color-text-secondary)',
                  lineHeight: 1.5,
                  maxWidth: '52ch',
                }}
              >
                {intl.formatMessage(i18n.welcomeDescription)}
              </p>
            </div>

            <AtlasProviderChooser
              onConfigured={handleConfigured}
              onFirstSelection={() => setHasSelection(true)}
            />
          </div>
        </div>
      </div>
    </HeroBackground>
  );
}
