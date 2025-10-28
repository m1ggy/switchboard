'use client';

import { Loader2, MapPin, Phone, Search } from 'lucide-react';
import * as React from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useTRPC } from '@/lib/trpc';
import { useQuery } from '@tanstack/react-query';

interface TwilioNumberSearchProps {
  onNumberSelect: (number: any) => void;
  selectedNumber: any;
}

interface PhoneNumber {
  phoneNumber: string;
  friendlyName: string;
  locality: string;
  region: string;
  postalCode: string | null;
  capabilities: string[];
  type: 'local';
  price: string;
}

// US states (incl. DC)
const US_STATES = [
  { code: 'AL', name: 'Alabama' },
  { code: 'AK', name: 'Alaska' },
  { code: 'AZ', name: 'Arizona' },
  { code: 'AR', name: 'Arkansas' },
  { code: 'CA', name: 'California' },
  { code: 'CO', name: 'Colorado' },
  { code: 'CT', name: 'Connecticut' },
  { code: 'DE', name: 'Delaware' },
  { code: 'FL', name: 'Florida' },
  { code: 'GA', name: 'Georgia' },
  { code: 'HI', name: 'Hawaii' },
  { code: 'ID', name: 'Idaho' },
  { code: 'IL', name: 'Illinois' },
  { code: 'IN', name: 'Indiana' },
  { code: 'IA', name: 'Iowa' },
  { code: 'KS', name: 'Kansas' },
  { code: 'KY', name: 'Kentucky' },
  { code: 'LA', name: 'Louisiana' },
  { code: 'ME', name: 'Maine' },
  { code: 'MD', name: 'Maryland' },
  { code: 'MA', name: 'Massachusetts' },
  { code: 'MI', name: 'Michigan' },
  { code: 'MN', name: 'Minnesota' },
  { code: 'MS', name: 'Mississippi' },
  { code: 'MO', name: 'Missouri' },
  { code: 'MT', name: 'Montana' },
  { code: 'NE', name: 'Nebraska' },
  { code: 'NV', name: 'Nevada' },
  { code: 'NH', name: 'New Hampshire' },
  { code: 'NJ', name: 'New Jersey' },
  { code: 'NM', name: 'New Mexico' },
  { code: 'NY', name: 'New York' },
  { code: 'NC', name: 'North Carolina' },
  { code: 'ND', name: 'North Dakota' },
  { code: 'OH', name: 'Ohio' },
  { code: 'OK', name: 'Oklahoma' },
  { code: 'OR', name: 'Oregon' },
  { code: 'PA', name: 'Pennsylvania' },
  { code: 'RI', name: 'Rhode Island' },
  { code: 'SC', name: 'South Carolina' },
  { code: 'SD', name: 'South Dakota' },
  { code: 'TN', name: 'Tennessee' },
  { code: 'TX', name: 'Texas' },
  { code: 'UT', name: 'Utah' },
  { code: 'VT', name: 'Vermont' },
  { code: 'VA', name: 'Virginia' },
  { code: 'WA', name: 'Washington' },
  { code: 'WV', name: 'West Virginia' },
  { code: 'WI', name: 'Wisconsin' },
  { code: 'WY', name: 'Wyoming' },
  { code: 'DC', name: 'District of Columbia' },
];

// State -> area code prefixes (NANP). Keep updated as overlays change.
const STATE_PREFIXES: Record<string, string[]> = {
  AL: ['205', '251', '256', '334', '938'],
  AK: ['907'],
  AZ: ['480', '520', '602', '623', '928'],
  AR: ['479', '501', '870'],
  CA: [
    '209',
    '213',
    '279',
    '310',
    '323',
    '341',
    '408',
    '415',
    '424',
    '442',
    '510',
    '530',
    '559',
    '562',
    '619',
    '626',
    '628',
    '650',
    '657',
    '661',
    '669',
    '707',
    '714',
    '747',
    '760',
    '805',
    '818',
    '820',
    '831',
    '840',
    '858',
    '909',
    '916',
    '925',
    '949',
    '951',
  ],
  CO: ['303', '719', '720', '970', '983'],
  CT: ['203', '475', '860', '959'],
  DE: ['302'],
  FL: [
    '239',
    '305',
    '321',
    '324',
    '352',
    '386',
    '407',
    '448',
    '561',
    '656',
    '727',
    '728',
    '754',
    '772',
    '786',
    '813',
    '850',
    '863',
    '904',
    '941',
    '945',
    '954',
    '963',
  ],
  GA: ['229', '404', '470', '478', '678', '706', '762', '770', '912', '943'],
  HI: ['808'],
  ID: ['208', '986'],
  IL: [
    '217',
    '224',
    '309',
    '312',
    '331',
    '447',
    '464',
    '618',
    '630',
    '708',
    '730',
    '773',
    '779',
    '815',
    '847',
    '872',
  ],
  IN: ['219', '260', '317', '463', '574', '765', '812', '930'],
  IA: ['319', '515', '563', '641', '712'],
  KS: ['316', '620', '785', '913'],
  KY: ['270', '364', '502', '606', '859'],
  LA: ['225', '318', '337', '504', '985'],
  ME: ['207'],
  MD: ['227', '240', '301', '410', '443', '667'],
  MA: ['339', '351', '413', '508', '617', '774', '781', '857', '978'],
  MI: [
    '231',
    '248',
    '269',
    '313',
    '517',
    '586',
    '616',
    '679',
    '734',
    '810',
    '906',
    '947',
    '989',
  ],
  MN: ['218', '320', '507', '612', '651', '763', '952'],
  MS: ['228', '601', '662', '769'],
  MO: ['314', '417', '557', '573', '636', '660', '816'],
  MT: ['406'],
  NE: ['308', '402', '531'],
  NV: ['702', '725', '775'],
  NH: ['603'],
  NJ: ['201', '551', '609', '640', '732', '848', '856', '862', '908', '973'],
  NM: ['505', '575'],
  NY: [
    '212',
    '315',
    '329',
    '332',
    '347',
    '363',
    '516',
    '518',
    '585',
    '607',
    '631',
    '646',
    '680',
    '716',
    '718',
    '838',
    '845',
    '846',
    '914',
    '917',
    '929',
    '934',
  ],
  NC: ['252', '336', '472', '704', '743', '828', '910', '919', '980', '984'],
  ND: ['701'],
  OH: [
    '216',
    '220',
    '234',
    '283',
    '326',
    '330',
    '380',
    '419',
    '440',
    '513',
    '567',
    '614',
    '740',
    '937',
    '938',
  ],
  OK: ['283', '405', '539', '572', '580', '918'],
  OR: ['458', '503', '541', '971'],
  PA: [
    '215',
    '223',
    '267',
    '272',
    '412',
    '445',
    '484',
    '570',
    '582',
    '610',
    '717',
    '724',
    '814',
    '835',
    '878',
  ],
  RI: ['401'],
  SC: ['803', '839', '843', '854', '864'],
  SD: ['605'],
  TN: ['423', '615', '629', '731', '865', '901', '931'],
  TX: [
    '210',
    '214',
    '254',
    '281',
    '325',
    '346',
    '361',
    '409',
    '430',
    '432',
    '469',
    '512',
    '682',
    '713',
    '726',
    '737',
    '806',
    '817',
    '830',
    '832',
    '903',
    '915',
    '936',
    '940',
    '945',
    '956',
    '972',
    '979',
  ],
  UT: ['385', '435', '801'],
  VT: ['802'],
  VA: ['276', '434', '540', '571', '703', '757', '804'],
  WA: ['206', '253', '360', '425', '564'],
  WV: ['304', '681'],
  WI: ['262', '274', '414', '534', '608', '715', '920'],
  WY: ['307'],
  DC: ['202'],
};

export function TwilioNumberSearch({
  onNumberSelect,
  selectedNumber,
}: TwilioNumberSearchProps) {
  const [searchQuery, setSearchQuery] = React.useState('');
  const [searchType, setSearchType] = React.useState<
    'area-code' | 'city' | 'state'
  >('area-code');

  // NEW: state & prefix selections
  const [selectedState, setSelectedState] = React.useState<string>('');
  const [selectedPrefixes, setSelectedPrefixes] = React.useState<string[]>([]);

  const [isSearching, setIsSearching] = React.useState(false);
  const [hasSearched, setHasSearched] = React.useState(false);
  const [searchResults, setSearchResults] = React.useState<PhoneNumber[]>([]);

  const trpc = useTRPC();

  // Build query params for the default (non-batched) path
  const queryParams = React.useMemo(() => {
    const base: any = { country: 'US' };
    if (searchType === 'area-code' && searchQuery.trim()) {
      base.areaCode = searchQuery.trim();
    }
    if (searchType === 'state' && selectedState) {
      base.region = selectedState; // map to Twilio's inRegion/region on the server
      if (selectedPrefixes.length === 1) {
        base.areaCode = selectedPrefixes[0];
      }
    }
    return base;
  }, [searchType, searchQuery, selectedState, selectedPrefixes]);

  const { data, refetch, isFetching } = useQuery(
    trpc.onboarding.searchAvailableNumbers.queryOptions(queryParams)
  );

  const handleSearch = async () => {
    setIsSearching(true);
    setHasSearched(true);

    if (searchType === 'area-code' && !/^\d{3}$/.test(searchQuery.trim())) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    let allResults: any[] = [];

    try {
      if (
        searchType === 'state' &&
        selectedState &&
        selectedPrefixes.length > 1
      ) {
        // Batch multiple area-code searches in parallel.
        // Works if your tRPC client exposes `.fetch` on query routes.
        // If not, move this batching server-side (recommended).
        const fetchFn =
          (trpc as any)?.onboarding?.searchAvailableNumbers?.fetch ??
          (async (q: any) => {
            // Fallback: if no .fetch, reuse refetch by temporarily instantiating a direct call
            // NOTE: Replace this with a proper server-side batch if needed.
            const res = await (
              trpc as any
            ).onboarding.searchAvailableNumbers.query?.(q);
            return res ?? [];
          });

        const batches = await Promise.all(
          selectedPrefixes.map((p) =>
            fetchFn({
              country: 'US',
              region: selectedState,
              areaCode: p,
            })
          )
        );
        allResults = batches.flat();
      } else {
        const { data: fresh = [] } = await refetch();
        allResults = fresh as any[];
      }
    } catch {
      allResults = [];
    }

    const results: PhoneNumber[] = (allResults as any[]).map((num: any) => ({
      phoneNumber: num.phoneNumber,
      friendlyName: num.friendlyName,
      locality: num.locality,
      region: num.region,
      postalCode: num.postalCode ?? null,
      capabilities: Object.entries(num.capabilities || {})
        .filter(([, enabled]) => enabled)
        .map(([key]) => (key as string).toUpperCase()),
      type: 'local',
      price: '$1.00',
    }));

    setSearchResults(results);
    setIsSearching(false);
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'local':
        return 'bg-blue-100 text-blue-800';
      case 'toll-free':
        return 'bg-green-100 text-green-800';
      case 'mobile':
        return 'bg-purple-100 text-purple-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="space-y-6 px-5">
      <Card className="border-2 border-dashed border-muted-foreground/25">
        <CardContent className="p-6 space-y-4">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center">
              <Phone className="w-4 h-4 text-primary" />
            </div>
            <span className="font-medium">Choose Your Phone Number</span>
          </div>
          <p className="text-sm text-muted-foreground mb-4">
            Search and select a phone number for your call center.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Search by */}
            <div className="space-y-2">
              <Label>Search by</Label>
              <Select
                value={searchType}
                onValueChange={(val) =>
                  setSearchType(val as 'area-code' | 'city' | 'state')
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="area-code">Area Code</SelectItem>
                  <SelectItem value="state">State + Prefix</SelectItem>
                  <SelectItem value="city" disabled>
                    City
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Area-code/City input OR State select */}
            {searchType !== 'state' ? (
              <div className="space-y-2">
                <Label htmlFor="search">
                  {searchType === 'area-code' ? 'Area Code' : 'City Name'}
                </Label>
                <Input
                  id="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={
                    searchType === 'area-code'
                      ? 'e.g., 857'
                      : 'e.g., Dorchester'
                  }
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                />
              </div>
            ) : (
              <div className="space-y-2">
                <Label htmlFor="state">State</Label>
                <Select
                  value={selectedState}
                  onValueChange={(v) => {
                    setSelectedState(v);
                    setSelectedPrefixes([]); // reset prefixes on state change
                  }}
                >
                  <SelectTrigger id="state">
                    <SelectValue placeholder="Select a state" />
                  </SelectTrigger>
                  <SelectContent className="max-h-72">
                    {US_STATES.map((s) => (
                      <SelectItem key={s.code} value={s.code}>
                        {s.name} ({s.code})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Prefix multi-select for state mode */}
            {searchType === 'state' ? (
              <div className="space-y-2">
                <Label>Prefixes (Area Codes)</Label>
                <PrefixMultiSelect
                  stateCode={selectedState}
                  selected={selectedPrefixes}
                  onChange={setSelectedPrefixes}
                />
              </div>
            ) : (
              <div />
            )}

            {/* Search button */}
            <div className="flex items-end">
              <Button
                onClick={handleSearch}
                disabled={
                  isSearching || (searchType === 'state' && !selectedState)
                }
                className="w-full"
              >
                {isSearching || isFetching ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Searching...
                  </>
                ) : (
                  <>
                    <Search className="w-4 h-4 mr-2" />
                    Search
                  </>
                )}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {hasSearched && (
        <div className="space-y-4 mx-4">
          <div className="flex items-center justify-between">
            <h4 className="font-medium">
              Available Numbers ({searchResults.length})
            </h4>
            {searchResults.length > 0 && (
              <p className="text-sm text-muted-foreground">
                Click a number to select it
              </p>
            )}
          </div>

          {isSearching ? (
            <Card>
              <CardContent className="text-center py-8">
                <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4" />
                <p className="text-muted-foreground">
                  Searching for available numbers...
                </p>
              </CardContent>
            </Card>
          ) : searchResults.length === 0 ? (
            <Card>
              <CardContent className="text-center py-8">
                <Phone className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                <p className="text-muted-foreground">
                  No numbers found for your search. Try a different area code,
                  state, or city.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-3 max-h-80 overflow-y-auto px-5 py-2">
              {searchResults.map((number, index) => (
                <Card
                  key={index}
                  className={`cursor-pointer transition-all hover:shadow-md ${
                    selectedNumber === number.phoneNumber
                      ? 'ring-2 ring-primary bg-primary/5'
                      : ''
                  }`}
                  onClick={() => onNumberSelect(number)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                          <Phone className="w-5 h-5 text-primary" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-lg">
                              {number.friendlyName}
                            </span>
                            <Badge className={getTypeColor(number.type)}>
                              {number.type}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-4 text-sm text-muted-foreground">
                            <div className="flex items-center gap-1">
                              <MapPin className="w-3 h-3" />
                              {number.locality && `${number.locality}, `}{' '}
                              {number.region}
                            </div>
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="flex gap-1 mb-1">
                          {number.capabilities.map((cap) => (
                            <Badge
                              key={cap}
                              variant="outline"
                              className="text-xs"
                            >
                              {cap}
                            </Badge>
                          ))}
                        </div>
                        {selectedNumber === number.phoneNumber && (
                          <Badge className="bg-green-100 text-green-800">
                            Selected
                          </Badge>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {!hasSearched && (
        <Card>
          <CardContent className="text-center py-12">
            <Phone className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
            <h4 className="text-lg font-semibold mb-2">
              Find Your Perfect Number
            </h4>
            <p className="text-muted-foreground max-w-md mx-auto">
              Search for available phone numbers by area code, state, or city.
              Choose from local numbers or toll-free options.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/**
 * Simple chip-style multi-select for prefixes based on selected state.
 * For a more advanced UI, you can swap this for a command palette or a shadcn Combobox.
 */
function PrefixMultiSelect({
  stateCode,
  selected,
  onChange,
}: {
  stateCode: string;
  selected: string[];
  onChange: (vals: string[]) => void;
}) {
  const options = stateCode ? (STATE_PREFIXES[stateCode] ?? []) : [];

  const toggle = (opt: string) => {
    onChange(
      selected.includes(opt)
        ? selected.filter((v) => v !== opt)
        : [...selected, opt]
    );
  };

  return (
    <div className="w-full">
      <div className="flex flex-wrap gap-2 rounded-md border p-2 min-h-[42px]">
        {selected.length === 0 ? (
          <span className="text-sm text-muted-foreground">All prefixes</span>
        ) : (
          selected.map((p) => (
            <Badge key={p} variant="outline" className="text-xs">
              {p}
            </Badge>
          ))
        )}
      </div>

      <div className="mt-2 max-h-56 overflow-auto rounded-md border bg-popover p-2 shadow-sm">
        <button
          type="button"
          className="w-full text-left text-sm px-2 py-1 hover:bg-accent rounded"
          onClick={() => onChange([])}
        >
          Select none (all prefixes)
        </button>
        <div className="mt-1 grid grid-cols-2 gap-1">
          {options.map((opt) => {
            const isSel = selected.includes(opt);
            return (
              <button
                type="button"
                key={opt}
                className={`text-left text-sm px-2 py-1 rounded hover:bg-accent ${
                  isSel ? 'bg-accent' : ''
                }`}
                onClick={() => toggle(opt)}
              >
                {opt}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
