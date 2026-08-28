/**
 * Provider Capability Model
 * Defines what each provider can expose through their APIs and what requires additional authorization
 */

export type ProviderName = 'openai' | 'anthropic' | 'gemini' | 'google';

export type ApiType = 'standard' | 'admin' | 'organization' | 'project' | 'none';

export type DataSource = 'manual' | 'provider_api' | 'email_billing_signal';

export interface ProviderCapability {
  provider: ProviderName;
  displayName: string;
  
  // Usage API capabilities
  usageApi: {
    supported: boolean;
    requiresAuthType?: ApiType;
    description?: string;
  };
  
  // Cost API capabilities
  costApi: {
    supported: boolean;
    requiresAuthType?: ApiType;
    description?: string;
  };
  
  // Balance/Credits capabilities
  balance: {
    supported: boolean;
    requiresAuthType?: ApiType;
    description?: string;
  };
  
  // Quota capabilities
  quota: {
    supported: boolean;
    requiresAuthType?: ApiType;
    description?: string;
  };
  
  // Email billing signal support
  emailBilling: {
    supported: boolean;
    eventTypes: string[];
  };
  
  // Required credential fields
  credentialFields: string[];
  
  // Optional credential fields for enhanced features
  optionalCredentialFields: string[];
}

export const PROVIDER_CAPABILITIES: Record<ProviderName, ProviderCapability> = {
  openai: {
    provider: 'openai',
    displayName: 'OpenAI',
    usageApi: {
      supported: true,
      requiresAuthType: 'admin',
      description: 'Organization usage requires Admin API key (sk-proj-). Standard API keys cannot access organization usage.'
    },
    costApi: {
      supported: true,
      requiresAuthType: 'admin',
      description: 'Organization costs available through Admin API with proper permissions.'
    },
    balance: {
      supported: false,
      description: 'OpenAI does not expose account balance through API.'
    },
    quota: {
      supported: false,
      description: 'OpenAI does not expose quota limits through API.'
    },
    emailBilling: {
      supported: true,
      eventTypes: ['invoice', 'payment_receipt', 'payment_failure', 'spending_alert', 'usage_threshold']
    },
    credentialFields: ['apiKey'],
    optionalCredentialFields: ['organizationId', 'isAdminKey']
  },
  
  anthropic: {
    provider: 'anthropic',
    displayName: 'Anthropic',
    usageApi: {
      supported: false,
      description: 'Anthropic does not provide a public usage API endpoint.'
    },
    costApi: {
      supported: false,
      description: 'Anthropic does not provide a public cost API endpoint.'
    },
    balance: {
      supported: false,
      description: 'Anthropic does not expose account balance through standard API keys.'
    },
    quota: {
      supported: false,
      description: 'Anthropic does not expose quota limits through standard API keys.'
    },
    emailBilling: {
      supported: true,
      eventTypes: ['invoice', 'payment_receipt', 'payment_failure', 'credit_purchase', 'spending_alert']
    },
    credentialFields: ['apiKey'],
    optionalCredentialFields: []
  },
  
  gemini: {
    provider: 'gemini',
    displayName: 'Google Gemini',
    usageApi: {
      supported: true,
      requiresAuthType: 'project',
      description: 'API keys alone do not provide usage data. Requires Google Cloud project authorization.'
    },
    costApi: {
      supported: true,
      requiresAuthType: 'project',
      description: 'Billing data requires Google Cloud project authorization with appropriate permissions.'
    },
    balance: {
      supported: false,
      description: 'Prepaid balance depends on account type and billing configuration.'
    },
    quota: {
      supported: true,
      requiresAuthType: 'project',
      description: 'Quota information available through Google Cloud Monitoring API.'
    },
    emailBilling: {
      supported: true,
      eventTypes: ['invoice', 'payment_receipt', 'payment_failure', 'quota_warning', 'spending_alert', 'usage_threshold']
    },
    credentialFields: ['apiKey'],
    optionalCredentialFields: ['projectId', 'billingAccountId']
  },
  
  google: {
    provider: 'google',
    displayName: 'Google Cloud',
    usageApi: {
      supported: true,
      requiresAuthType: 'project',
      description: 'Requires Google Cloud project authorization with appropriate scopes.'
    },
    costApi: {
      supported: true,
      requiresAuthType: 'project',
      description: 'Billing data requires Cloud Billing API access.'
    },
    balance: {
      supported: false,
      description: 'Balance depends on billing account type and configuration.'
    },
    quota: {
      supported: true,
      requiresAuthType: 'project',
      description: 'Quota information available through Google Cloud Monitoring API.'
    },
    emailBilling: {
      supported: true,
      eventTypes: ['invoice', 'payment_receipt', 'payment_failure', 'quota_warning', 'spending_alert', 'usage_threshold', 'account_change']
    },
    credentialFields: ['projectId'],
    optionalCredentialFields: ['billingAccountId', 'serviceAccountKey']
  }
};

export function getProviderCapability(provider: ProviderName): ProviderCapability {
  return PROVIDER_CAPABILITIES[provider];
}

export function isCapabilitySupported(
  provider: ProviderName,
  capability: keyof ProviderCapability,
  authType?: ApiType
): boolean {
  const providerCap = getProviderCapability(provider);
  const capValue = providerCap[capability] as any;
  
  if (!capValue || !capValue.supported) {
    return false;
  }
  
  // If the capability requires a specific auth type, check if it matches
  if (capValue.requiresAuthType && authType && capValue.requiresAuthType !== authType) {
    return false;
  }
  
  return true;
}

export function getCapabilityDescription(
  provider: ProviderName,
  capability: keyof ProviderCapability
): string {
  const providerCap = getProviderCapability(provider);
  const capValue = providerCap[capability] as any;
  
  if (!capValue) {
    return 'Capability not found';
  }
  
  if (!capValue.supported) {
    return capValue.description || 'Not supported by this provider';
  }
  
  if (capValue.requiresAuthType) {
    return `Requires ${capValue.requiresAuthType} authorization. ${capValue.description || ''}`;
  }
  
  return capValue.description || 'Supported';
}
