"use client";

import { format, parseISO } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { useState } from "react";
import type { Matcher } from "react-day-picker";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

type DatePickerProps = {
  id?: string;
  name?: string;
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  defaultMonth?: Date;
  startMonth?: Date;
  endMonth?: Date;
  disabledDates?: Matcher | Array<Matcher>;
  disabled?: boolean;
  required?: boolean;
  className?: string;
  onBlur?: () => void;
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
};

function DatePicker({
  value,
  onValueChange,
  placeholder = "Choose a date",
  defaultMonth,
  startMonth,
  endMonth,
  disabledDates,
  disabled,
  required,
  className,
  onBlur,
  ...props
}: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const selected = value ? parseISO(value) : undefined;

  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) onBlur?.();
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          aria-required={required}
          className={cn(
            "w-full cursor-pointer justify-start text-left font-normal",
            !selected && "text-muted-foreground",
            className,
          )}
          {...props}
        >
          <CalendarIcon className="size-4" aria-hidden="true" />
          {selected ? format(selected, "MMMM d, yyyy") : placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          captionLayout="dropdown"
          selected={selected}
          defaultMonth={selected ?? defaultMonth}
          startMonth={startMonth}
          endMonth={endMonth}
          disabled={disabledDates}
          onSelect={(date) => {
            if (!date) return;
            onValueChange(format(date, "yyyy-MM-dd"));
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

export { DatePicker };
export type { DatePickerProps };
