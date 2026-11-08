import { Input } from "@/components/ui/input";

export const gigScheduleInputClassName = "min-w-0 bg-background border-border text-foreground text-sm";

export function GigDateTimeInputs({
  id,
  timeLabel,
  date,
  time,
  onDateChange,
  onTimeChange,
  dateRequired,
  timeRequired,
}: {
  id: string;
  timeLabel: string;
  date: string;
  time: string;
  onDateChange: (value: string) => void;
  onTimeChange: (value: string) => void;
  dateRequired?: boolean;
  timeRequired?: boolean;
}) {
  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_minmax(8rem,9rem)] gap-2 max-[389px]:grid-cols-1 sm:grid-cols-3">
      <div className="min-w-0 sm:col-span-2">
        <Input
          id={`${id}_date`}
          name={`${id}_date`}
          type="date"
          value={date}
          onChange={(event) => onDateChange(event.target.value)}
          required={dateRequired}
          className={gigScheduleInputClassName}
        />
      </div>
      <div className="min-w-0 sm:col-span-1">
        <Input
          id={`${id}_time`}
          name={`${id}_time`}
          type="time"
          aria-label={timeLabel}
          value={time}
          onChange={(event) => onTimeChange(event.target.value)}
          required={timeRequired}
          className={gigScheduleInputClassName}
        />
      </div>
    </div>
  );
}
