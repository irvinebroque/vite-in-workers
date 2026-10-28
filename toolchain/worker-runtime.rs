//! A current-thread executor that yields back to JavaScript between bounded ticks.
use std::{
    cell::RefCell,
    future::{Future, poll_fn},
    pin::Pin,
    task::Poll,
};

use napi::{
    bindgen_prelude::{AsyncRuntime, AsyncRuntimeRejection, AsyncRuntimeTask},
    tokio::{self, runtime::Runtime},
};
use napi_derive::napi;

thread_local! {
  static RUNTIME: RefCell<Option<Runtime>> = const { RefCell::new(None) };
}

pub struct WorkerRuntime;

// SAFETY: This module is compiled only for threadless WASM. No work escapes the
// instance; shutdown drops every queued task before returning. The Worker owns
// the entire instance and discards it after one build.
unsafe impl AsyncRuntime for WorkerRuntime {
    fn start(&self) -> napi::Result<()> {
        RUNTIME.with_borrow_mut(|slot| {
            if slot.is_none() {
                let runtime = tokio::runtime::Builder::new_current_thread()
                    .enable_all()
                    .build()?;
                *slot = Some(runtime);
            }
            Ok(())
        })
    }

    fn spawn(&self, task: AsyncRuntimeTask) -> Result<(), AsyncRuntimeRejection<AsyncRuntimeTask>> {
        RUNTIME.with_borrow(|slot| {
            if let Some(runtime) = slot {
                runtime.spawn(task);
                Ok(())
            } else {
                Err(AsyncRuntimeRejection::new(
                    task,
                    napi::Error::from_reason("Worker runtime is stopped"),
                ))
            }
        })
    }

    fn block_on(&self, _future: Pin<&mut dyn Future<Output = ()>>) -> napi::Result<()> {
        // Blocking on a JS callback would deadlock the only thread.
        Err(napi::Error::from_reason(
            "Use an asynchronous API in the Worker runtime",
        ))
    }

    fn shutdown(&self) -> napi::Result<()> {
        RUNTIME.with_borrow_mut(|slot| {
            slot.take();
        });
        Ok(())
    }
}

#[napi]
pub fn advance_worker_tasks(mut turns: u32) {
    RUNTIME.with_borrow(|slot| {
        if let Some(runtime) = slot {
            // Keep the root future runnable for a bounded number of polls. Tokio
            // can service queued tasks, but cannot park waiting for JavaScript.
            // Returning Ready ends this call so JS callbacks can run next.
            runtime.block_on(poll_fn(|context| {
                if turns == 0 {
                    return Poll::Ready(());
                }
                turns -= 1;
                context.waker().wake_by_ref();
                Poll::Pending
            }));
        }
    });
}
