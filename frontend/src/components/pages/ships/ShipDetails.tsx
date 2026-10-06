import React from 'react';
import {
  Accordion, AccordionDetails, AccordionSummary, Box, Button, Card, CardContent, CardHeader,
  Chip, CircularProgress, Grid, Typography
} from '@mui/material';
import {
  ExpandMore as ExpandMoreIcon, LocalHospital as HealIcon, Warning as WarningIcon
} from '@mui/icons-material';
import { SHIP_IMPROVEMENTS } from '../../../data/shipData';
import ImprovementEffects, { ImprovementInfo } from './ImprovementEffects';
import { CrewMember, Ship, formatSigned, getShipStatusChipColor, withShipDefaults } from './shipUtils';

const IMPROVEMENTS = SHIP_IMPROVEMENTS as Record<string, ImprovementInfo>;

interface StatFieldProps {
  label: string;
  value: React.ReactNode;
  /** Grid columns out of 12 (default: half width). */
  size?: number;
  variant?: 'body2' | 'h6';
}

/** One label / value cell of a details card. */
const StatField: React.FC<StatFieldProps> = ({ label, value, size = 6, variant = 'body2' }) => (
  <Grid size={size}>
    <Typography variant="subtitle2" color="primary">{label}</Typography>
    <Typography variant={variant}>{value}</Typography>
  </Grid>
);

interface FieldCardProps {
  title: string;
  children: React.ReactNode;
}

const FieldCard: React.FC<FieldCardProps> = ({ title, children }) => (
  <Card>
    <CardHeader title={title} />
    <CardContent>{children}</CardContent>
  </Card>
);

interface ShipDetailsProps {
  ship: Ship;
  crew: CrewMember[];
  loadingCrew: boolean;
  onDamage: (ship: Ship) => void;
  onRepair: (ship: Ship) => void;
}

/** The "Ship Details" tab: every stored value of one ship plus its crew. */
const ShipDetails: React.FC<ShipDetailsProps> = ({ ship: storedShip, crew, loadingCrew, onDamage, onRepair }) => {
  const ship = withShipDefaults(storedShip);

  return (
    <Grid container spacing={3}>
      <Grid size={{ xs: 12, md: 6 }}>
        <FieldCard title="Ship Information">
          <Typography variant="h6">{ship.name}</Typography>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <StatField label="Ship Type" value={ship.ship_type || 'Not specified'} size={12} />
            <StatField label="Size" value={ship.size} />
            <StatField label="Cost" value={`${ship.cost} gp`} />
            <StatField label="Location" value={ship.location || 'Unknown'} />
            <Grid size={6}>
              <Typography variant="subtitle2" color="primary">Status</Typography>
              <Chip label={ship.status} color={getShipStatusChipColor(ship.status)} size="small" />
            </Grid>
            {ship.captain_name && <StatField label="Captain" value={ship.captain_name} size={12} />}
            {ship.ship_notes && (
              <StatField
                label="Notes"
                value={<Box component="span" sx={{ whiteSpace: 'pre-wrap' }}>{ship.ship_notes}</Box>}
                size={12}
              />
            )}
          </Grid>
        </FieldCard>
      </Grid>

      <Grid size={{ xs: 12, md: 6 }}>
        <FieldCard title="Physical Characteristics">
          <Grid container spacing={2}>
            <StatField label="Max Speed" value={`${ship.max_speed} ft.`} />
            <StatField label="Acceleration" value={`${ship.acceleration} ft.`} />
            <StatField label="Propulsion" value={ship.propulsion || 'Not specified'} size={12} />
            <StatField label="Crew Requirements" value={`${ship.min_crew} - ${ship.max_crew}`} />
            <StatField label="Decks" value={ship.decks} />
            <StatField label="Cargo Capacity" value={`${ship.cargo_capacity} lbs`} />
            <StatField label="Max Passengers" value={ship.max_passengers} />
            {ship.sails_oars && <StatField label="Sails/Oars" value={ship.sails_oars} size={12} />}
            <StatField label="Sailing Check Bonus" value={formatSigned(ship.sailing_check_bonus)} size={12} />
          </Grid>
        </FieldCard>
      </Grid>

      <Grid size={{ xs: 12, md: 6 }}>
        <FieldCard title="Combat Statistics">
          <Grid container spacing={2}>
            <StatField label="Hit Points" value={`${ship.current_hp} / ${ship.max_hp}`} variant="h6" />
            <StatField label="Hardness" value={ship.hardness} />
            <StatField label="Base AC" value={ship.base_ac} />
            <StatField label="Touch AC" value={ship.touch_ac} />
            <StatField label="CMB" value={formatSigned(ship.cmb)} />
            <StatField label="CMD" value={ship.cmd} />
            <StatField label="Saves" value={formatSigned(ship.saves)} />
            <StatField label="Initiative" value={formatSigned(ship.initiative)} />
            <StatField label="Ramming Damage" value={ship.ramming_damage} size={12} />
          </Grid>
          <Box sx={{ mt: 2 }}>
            <Button
              variant="outlined"
              color="warning"
              startIcon={<WarningIcon />}
              onClick={() => onDamage(storedShip)}
              disabled={ship.current_hp <= 0}
              sx={{ mr: 1 }}
              size="small"
            >
              Apply Damage
            </Button>
            <Button
              variant="outlined"
              color="success"
              startIcon={<HealIcon />}
              onClick={() => onRepair(storedShip)}
              disabled={ship.current_hp >= ship.max_hp}
              size="small"
            >
              Repair Ship
            </Button>
          </Box>
        </FieldCard>
      </Grid>

      <Grid size={{ xs: 12, md: 6 }}>
        <FieldCard title="Ship Weapons">
          {ship.weapon_types.length > 0 && (
            <Box sx={{ mb: 2 }}>
              <Typography variant="subtitle2" color="primary" sx={{ mb: 1 }}>Weapon Types</Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                {ship.weapon_types.map((weaponType, index) => (
                  <Chip
                    key={index}
                    label={`${weaponType.type} (${weaponType.quantity})`}
                    variant="outlined"
                    size="small"
                  />
                ))}
              </Box>
            </Box>
          )}

          {ship.weapons.length > 0 && (
            <Box>
              <Typography variant="subtitle2" color="primary" sx={{ mb: 1 }}>Detailed Weapons</Typography>
              {ship.weapons.map((weapon, index) => (
                <Box key={index} sx={{ mb: 1, p: 1, border: '1px solid #eee', borderRadius: 1 }}>
                  <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                    {weapon.name || `Weapon ${index + 1}`}
                  </Typography>
                  {weapon.type && (
                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                      {weapon.type} | {weapon.damage} | {weapon.range}
                    </Typography>
                  )}
                </Box>
              ))}
            </Box>
          )}

          {ship.weapon_types.length === 0 && ship.weapons.length === 0 && (
            <Typography sx={{ color: 'text.secondary' }}>No weapons installed</Typography>
          )}
        </FieldCard>
      </Grid>

      <Grid size={12}>
        <FieldCard title="Ship Improvements">
          {ship.improvements.length > 0 ? (
            <Box>
              {ship.improvements.map((improvementName, index) => {
                const improvement = IMPROVEMENTS[improvementName];
                if (!improvement) {
                  // Custom improvement that is not in the standard list
                  return (
                    <Chip
                      key={index}
                      label={improvementName}
                      color="primary"
                      variant="outlined"
                      sx={{ mr: 1, mb: 1 }}
                    />
                  );
                }

                return (
                  <Accordion key={improvementName} sx={{ mb: 1 }}>
                    <AccordionSummary
                      expandIcon={<ExpandMoreIcon />}
                      aria-controls={`improvement-${index}-content`}
                      id={`improvement-${index}-header`}
                    >
                      <Typography variant="h6" color="primary">{improvement.name}</Typography>
                    </AccordionSummary>
                    <AccordionDetails>
                      <ImprovementEffects improvement={improvement} descriptionSpacing={2} />
                    </AccordionDetails>
                  </Accordion>
                );
              })}
            </Box>
          ) : (
            <Typography sx={{ color: 'text.secondary' }}>No improvements installed</Typography>
          )}
        </FieldCard>
      </Grid>

      {ship.officers.length > 0 && (
        <Grid size={{ xs: 12, md: 6 }}>
          <FieldCard title="Officers">
            {ship.officers.map((officer, index) => (
              <Box key={index} sx={{ mb: 1, p: 1, border: '1px solid #eee', borderRadius: 1 }}>
                <Typography variant="body2" sx={{ fontWeight: 'bold' }}>{officer.position}</Typography>
                <Typography variant="body2" sx={{ color: 'text.secondary' }}>{officer.name}</Typography>
              </Box>
            ))}
          </FieldCard>
        </Grid>
      )}

      {(ship.plunder > 0 || ship.infamy > 0 || ship.disrepute > 0) && (
        <Grid size={{ xs: 12, md: 6 }}>
          <FieldCard title="Pirate Campaign Stats">
            <Grid container spacing={2}>
              <StatField label="Plunder" value={ship.plunder} size={4} variant="h6" />
              <StatField label="Infamy" value={ship.infamy} size={4} variant="h6" />
              <StatField label="Disrepute" value={ship.disrepute} size={4} variant="h6" />
            </Grid>
          </FieldCard>
        </Grid>
      )}

      {ship.flag_description && (
        <Grid size={12}>
          <FieldCard title="Ship's Flag">
            <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>{ship.flag_description}</Typography>
          </FieldCard>
        </Grid>
      )}

      <Grid size={12}>
        <Card>
          <CardHeader title="Crew Members" subheader={`${crew.length} crew members aboard`} />
          <CardContent>
            {loadingCrew ? (
              <CircularProgress size={24} />
            ) : crew.length > 0 ? (
              <Grid container spacing={2}>
                {crew.map((member) => (
                  <Grid size={{ xs: 12, sm: 6, md: 4 }} key={member.id}>
                    <Box sx={{ p: 2, border: '1px solid #eee', borderRadius: 1 }}>
                      <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                        {member.name}
                        {member.ship_position && (
                          <Chip
                            label={member.ship_position}
                            size="small"
                            sx={{ ml: 1 }}
                            color={member.ship_position === 'captain' ? 'primary' : 'default'}
                          />
                        )}
                      </Typography>
                      {member.race && (
                        <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
                          {member.race}
                        </Typography>
                      )}
                      {member.age && (
                        <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
                          Age: {member.age}
                        </Typography>
                      )}
                      {member.description && (
                        <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 0.5 }}>
                          {member.description}
                        </Typography>
                      )}
                    </Box>
                  </Grid>
                ))}
              </Grid>
            ) : (
              <Typography sx={{ color: 'text.secondary' }}>No crew members assigned</Typography>
            )}
          </CardContent>
        </Card>
      </Grid>
    </Grid>
  );
};

export default ShipDetails;
