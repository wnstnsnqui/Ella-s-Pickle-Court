"use client";

import { Bell, CalendarPlus, LandPlot, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * The interactive pieces feature 6 needs. Spec 0003, AC-14.
 *
 * Shown with the copy they will really carry, because a button labelled "Button"
 * proves nothing about whether the wording fits.
 */
export function ComponentGallery() {
  return (
    <div className="flex flex-col gap-6">
      <Group title="Buttons">
        <div className="flex flex-wrap items-center gap-2">
          <Button>
            <CalendarPlus aria-hidden="true" data-icon="inline-start" />
            Book this hour
          </Button>
          <Button variant="secondary">Edit booking</Button>
          <Button variant="outline">Close the court</Button>
          <Button variant="ghost">Cancel</Button>
          <Button variant="destructive">
            <Trash2 aria-hidden="true" data-icon="inline-start" />
            Cancel booking
          </Button>
          <Button size="sm">Small</Button>
          <Button size="icon" aria-label="Notifications">
            <Bell aria-hidden="true" />
          </Button>
          <Button disabled>Saving…</Button>
        </div>
      </Group>

      <Group title="Fields">
        <div className="flex max-w-sm flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="demo-name" className="text-label">
              Customer name
            </label>
            <Input id="demo-name" placeholder="Who is this hour for?" />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="demo-phone" className="text-label">
              Phone
            </label>
            <Input
              id="demo-phone"
              defaultValue="not a phone number"
              aria-invalid
              aria-describedby="demo-phone-error"
            />
            <p id="demo-phone-error" className="text-caption text-destructive">
              That does not look like a phone number.
            </p>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="demo-payment" className="text-label">
              Payment
            </label>
            <Select>
              <SelectTrigger id="demo-payment" className="w-full">
                <SelectValue placeholder="Not paid yet" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectLabel>Payment</SelectLabel>
                  <SelectItem value="unpaid">Unpaid</SelectItem>
                  <SelectItem value="partial">Part paid</SelectItem>
                  <SelectItem value="paid">Paid</SelectItem>
                  <SelectItem value="waived">Waived</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
        </div>
      </Group>

      <Group title="Overlays">
        <div className="flex flex-wrap gap-2">
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline">Open a dialog</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Cancel this booking?</DialogTitle>
                <DialogDescription>
                  Court 1 at 9am, booked for Marites. Cancelling frees the hour straight away and
                  everybody watching the board sees it.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="ghost">Keep it</Button>
                </DialogClose>
                <DialogClose asChild>
                  <Button variant="destructive">Cancel booking</Button>
                </DialogClose>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Sheet>
            <SheetTrigger asChild>
              <Button variant="outline">Open a sheet</Button>
            </SheetTrigger>
            <SheetContent>
              <SheetHeader>
                <SheetTitle>Court 2 at 10am</SheetTitle>
                <SheetDescription>
                  This is the shape the booking form takes on a phone, where a dialog would be
                  cramped.
                </SheetDescription>
              </SheetHeader>
              <div className="flex flex-col gap-3 px-4">
                <Input placeholder="Customer name" aria-label="Customer name" />
                <Input placeholder="Phone, optional" aria-label="Phone" />
              </div>
              <SheetFooter>
                <SheetClose asChild>
                  <Button>Save booking</Button>
                </SheetClose>
              </SheetFooter>
            </SheetContent>
          </Sheet>

          <Button
            variant="outline"
            onClick={() =>
              toast.success("Court 1 at 9am is booked", {
                description: "Everybody watching the board just saw it turn.",
              })
            }
          >
            Raise a toast
          </Button>
          <Button
            variant="outline"
            onClick={() =>
              toast.error("Somebody got there first", {
                description: "That hour was taken while you were typing. The grid is refreshed.",
              })
            }
          >
            Raise an error toast
          </Button>
        </div>
      </Group>

      <Group title="Badges and separators">
        <div className="flex flex-wrap items-center gap-2">
          <Badge>Owner</Badge>
          <Badge variant="secondary">Staff</Badge>
          <Badge variant="outline">Unpaid</Badge>
          <Badge variant="destructive">Cancelled</Badge>
          <Separator orientation="vertical" className="h-5" />
          <span className="text-caption text-muted-foreground">after a vertical separator</span>
        </div>
        <Separator />
      </Group>

      <Group title="Alerts">
        <div className="flex flex-col gap-3">
          <Alert>
            <Bell aria-hidden="true" />
            <AlertTitle>Opening hours changed</AlertTitle>
            <AlertDescription>
              Weekends now run 6am to 9pm. Bookings already outside those hours keep their own row.
            </AlertDescription>
          </Alert>
          <Alert variant="destructive">
            <Bell aria-hidden="true" />
            <AlertTitle>That hour is already taken</AlertTitle>
            <AlertDescription>
              Somebody booked Court 1 at 9am while this form was open.
            </AlertDescription>
          </Alert>
        </div>
      </Group>

      <Group title="Skeleton and empty">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Skeleton className="h-8 w-40 rounded-md" />
            <Skeleton className="h-row rounded-cell w-full" />
            <Skeleton className="h-row rounded-cell w-full" />
          </div>
          <Empty className="border-border rounded-lg border border-dashed">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <LandPlot aria-hidden="true" />
              </EmptyMedia>
              <EmptyTitle>No courts yet</EmptyTitle>
              <EmptyDescription>
                Once a court is added it shows up here with its hours.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        </div>
      </Group>
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-label text-muted-foreground">{title}</h3>
      {children}
    </div>
  );
}
