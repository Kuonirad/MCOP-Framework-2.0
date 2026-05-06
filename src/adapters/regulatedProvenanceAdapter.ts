import { createHash } from 'node:crypto';

import { BaseAdapter, BaseAdapterDeps, PreparedDispatch } from './baseAdapter';
import {
  AdapterCapabilities,
  AdapterRequest,
  ProvenanceMetadata,
} from './types';

export type RegulatedMappingTarget = 'fhir' | 'iso20022' | 'both';
export type RegulatedVerificationStatus = 'SEALED' | 'UNVERIFIED';

export interface RegulatedProvenancePayload extends Record<string, unknown> {
  target?: RegulatedMappingTarget;
  subjectId?: string;
  targetReference?: string;
  custodianOrg?: string;
  operatorId?: string;
  sourceInstitutionId?: string;
  receiverInstitutionId?: string;
  businessMessageId?: string;
  messageDefinitionId?: string;
  purposeCode?: string;
}

export type RegulatedProvenanceRequest = AdapterRequest<RegulatedProvenancePayload>;

export interface FhirCoding {
  system: string;
  code: string;
  display: string;
}

export interface FhirProvenanceEntity {
  role: 'source' | 'derivation';
  what: {
    identifier: {
      system: string;
      value: string;
    };
    display?: string;
  };
}

export interface FhirProvenanceResource {
  resourceType: 'Provenance';
  id: string;
  recorded: string;
  target: Array<{ reference: string }>;
  activity: { coding: FhirCoding[] };
  agent: Array<{
    type: { coding: FhirCoding[] };
    who: { identifier: { system: string; value: string }; display?: string };
  }>;
  entity: FhirProvenanceEntity[];
  signature: Array<{
    type: FhirCoding[];
    when: string;
    who: { reference: string };
    data: string;
  }>;
  extension: Array<{
    url: string;
    valueString?: string;
    valueDecimal?: number;
    valueCode?: RegulatedVerificationStatus;
  }>;
}

export interface Iso20022ProvenanceEnvelope {
  AppHdr: {
    Fr: { FIId: { FinInstnId: { Othr: { Id: string } } } };
    To: { FIId: { FinInstnId: { Othr: { Id: string } } } };
    BizMsgIdr: string;
    MsgDefIdr: string;
    BizSvc: string;
    CreDt: string;
  };
  Document: {
    MCOPrvnc: {
      PrvcRoot: string;
      TnsrHash: string;
      TraceId?: string;
      TraceHash?: string;
      RsnScore: string;
      EtchDelta: string;
      VrfctnSts: RegulatedVerificationStatus;
      Purp: { Cd: string };
      RefinedPromptHash: string;
      RcrdTs: string;
    };
  };
}

export interface RegulatedProvenanceDispatchResult {
  verificationStatus: RegulatedVerificationStatus;
  fhir?: FhirProvenanceResource;
  iso20022?: Iso20022ProvenanceEnvelope;
  disclaimer: string;
}

export interface RegulatedProvenanceAdapterConfig extends BaseAdapterDeps {
  defaultTarget?: RegulatedMappingTarget;
  custodianOrg?: string;
}

const MCOP_SYSTEM = 'https://github.com/Kuonirad/MCOP-Framework-2.0/provenance';
const DISCLAIMER =
  'MCOP regulated mappings prove process integrity, lineage, and replayability only; they do not certify clinical correctness, financial suitability, HIPAA compliance, FDA clearance, or model-risk approval.';

export class RegulatedProvenanceAdapter extends BaseAdapter<
  RegulatedProvenanceRequest,
  RegulatedProvenanceDispatchResult
> {
  private readonly defaultTarget: RegulatedMappingTarget;
  private readonly custodianOrg?: string;

  constructor(config: RegulatedProvenanceAdapterConfig) {
    super(config);
    this.defaultTarget = config.defaultTarget ?? 'both';
    this.custodianOrg = config.custodianOrg;
  }

  protected platformName(): string {
    return 'regulated-provenance';
  }

  async getCapabilities(): Promise<AdapterCapabilities> {
    return {
      platform: this.platformName(),
      version: '0.3.0',
      models: ['fhir-provenance-r4-compatible', 'iso20022-mcop-provenance-envelope'],
      supportsAudit: true,
      features: [
        'fhir-provenance-mapping',
        'iso20022-business-envelope-mapping',
        'sealed-status-derivation',
        'human-primacy-disclaimer',
      ],
      notes: DISCLAIMER,
    };
  }

  protected async callPlatform(
    dispatch: PreparedDispatch,
    request: RegulatedProvenanceRequest,
  ): Promise<RegulatedProvenanceDispatchResult> {
    const payload = request.payload ?? {};
    const target = payload.target ?? this.defaultTarget;
    const verificationStatus = deriveVerificationStatus(dispatch.provenance);
    return {
      verificationStatus,
      ...(target === 'fhir' || target === 'both'
        ? {
            fhir: mapProvenanceToFHIR(dispatch.provenance, {
              ...payload,
              custodianOrg: payload.custodianOrg ?? this.custodianOrg,
              verificationStatus,
            }),
          }
        : {}),
      ...(target === 'iso20022' || target === 'both'
        ? {
            iso20022: mapProvenanceToISO20022(dispatch.provenance, {
              ...payload,
              custodianOrg: payload.custodianOrg ?? this.custodianOrg,
              verificationStatus,
            }),
          }
        : {}),
      disclaimer: DISCLAIMER,
    };
  }
}

export function mapProvenanceToFHIR(
  provenance: ProvenanceMetadata,
  options: RegulatedProvenancePayload & {
    verificationStatus?: RegulatedVerificationStatus;
  } = {},
): FhirProvenanceResource {
  const verificationStatus = options.verificationStatus ?? deriveVerificationStatus(provenance);
  const targetReference = options.targetReference ?? `DocumentReference/${safeId(options.subjectId ?? provenance.traceId ?? provenance.tensorHash.slice(0, 16))}`;
  const operatorId = options.operatorId ?? 'human-operator-required';
  const custodianOrg = options.custodianOrg ?? 'mcop-custodian';

  return {
    resourceType: 'Provenance',
    id: `mcop-${provenance.etchHash.slice(0, 24)}`,
    recorded: provenance.timestamp,
    target: [{ reference: targetReference }],
    activity: {
      coding: [
        {
          system: `${MCOP_SYSTEM}/activity`,
          code: 'MCOP_SYNTHESIS_TRACE',
          display: 'MCOP synthesis provenance trace',
        },
      ],
    },
    agent: [
      {
        type: { coding: [{ system: `${MCOP_SYSTEM}/agent`, code: 'assembler', display: 'MCOP triad pipeline' }] },
        who: { identifier: { system: `${MCOP_SYSTEM}/system`, value: 'nova-neo-stigmergy-holo-etch' }, display: 'MCOP deterministic triad' },
      },
      {
        type: { coding: [{ system: `${MCOP_SYSTEM}/agent`, code: 'author', display: 'Human accountable operator' }] },
        who: { identifier: { system: `${MCOP_SYSTEM}/operator`, value: operatorId }, display: 'Human-in-the-loop authority' },
      },
    ],
    entity: [
      entity('source', 'tensorHash', provenance.tensorHash, 'NOVA-NEO encoded tensor hash'),
      ...(provenance.traceHash
        ? [entity('derivation', 'traceHash', provenance.traceHash, 'Stigmergy Merkle trace hash')]
        : []),
      entity('derivation', 'etchHash', provenance.etchHash, 'Holographic Etch Merkle root'),
    ],
    signature: [
      {
        type: [{ system: 'urn:iso-astm:E1762-95:2013', code: '1.2.840.10065.1.12.1.5', display: 'Verification signature' }],
        when: provenance.timestamp,
        who: { reference: `Organization/${safeId(custodianOrg)}` },
        data: provenance.etchHash,
      },
    ],
    extension: [
      { url: `${MCOP_SYSTEM}/resonanceScore`, valueDecimal: provenance.resonanceScore },
      { url: `${MCOP_SYSTEM}/etchDelta`, valueDecimal: provenance.etchDelta },
      { url: `${MCOP_SYSTEM}/verificationStatus`, valueCode: verificationStatus },
      { url: `${MCOP_SYSTEM}/traceId`, valueString: provenance.traceId ?? 'not-recorded' },
      { url: `${MCOP_SYSTEM}/scopeDisclaimer`, valueString: DISCLAIMER },
    ],
  };
}

export function mapProvenanceToISO20022(
  provenance: ProvenanceMetadata,
  options: RegulatedProvenancePayload & {
    verificationStatus?: RegulatedVerificationStatus;
  } = {},
): Iso20022ProvenanceEnvelope {
  const created = provenance.timestamp;
  const source = options.sourceInstitutionId ?? options.custodianOrg ?? 'MCOP-CUSTODIAN';
  const receiver = options.receiverInstitutionId ?? 'REGULATED-REVIEWER';
  const bizMsgId = options.businessMessageId ?? `MCOP-${provenance.etchHash.slice(0, 24)}`;
  return {
    AppHdr: {
      Fr: { FIId: { FinInstnId: { Othr: { Id: source } } } },
      To: { FIId: { FinInstnId: { Othr: { Id: receiver } } } },
      BizMsgIdr: bizMsgId,
      MsgDefIdr: options.messageDefinitionId ?? 'mcop.prvc.002.001.00',
      BizSvc: 'MCOP_PROVENANCE_REPLAY',
      CreDt: created,
    },
    Document: {
      MCOPrvnc: {
        PrvcRoot: provenance.etchHash,
        TnsrHash: provenance.tensorHash,
        ...(provenance.traceId ? { TraceId: provenance.traceId } : {}),
        ...(provenance.traceHash ? { TraceHash: provenance.traceHash } : {}),
        RsnScore: provenance.resonanceScore.toFixed(6),
        EtchDelta: provenance.etchDelta.toExponential(6),
        VrfctnSts: options.verificationStatus ?? deriveVerificationStatus(provenance),
        Purp: { Cd: options.purposeCode ?? 'AUDT' },
        RefinedPromptHash: sha256(provenance.refinedPrompt),
        RcrdTs: provenance.timestamp,
      },
    },
  };
}

export function deriveVerificationStatus(
  provenance: ProvenanceMetadata,
): RegulatedVerificationStatus {
  const sealed = [provenance.tensorHash, provenance.etchHash]
    .every((value) => /^[0-9a-f]{64}$/.test(value));
  return sealed ? 'SEALED' : 'UNVERIFIED';
}

function entity(
  role: FhirProvenanceEntity['role'],
  key: string,
  value: string,
  display: string,
): FhirProvenanceEntity {
  return {
    role,
    what: {
      identifier: { system: `${MCOP_SYSTEM}/${key}`, value },
      display,
    },
  };
}

function safeId(value: string): string {
  return value.replace(/[^A-Za-z0-9-.]/g, '-').slice(0, 64);
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
